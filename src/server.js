const debug = require('debug')('divvy');

const EventEmitter = require('events');
const net = require('net');
const carrier = require('carrier');
const Constants = require('./constants');
const Errors = require('./errors');
const Utils = require('./utils');
const { Dispatcher, ok, error } = require('./dispatcher');
const { invariant } = Utils;

const DEFAULT_PORT = 8321;

const ERROR_CODE_UNKNOWN_COMMAND = 'unknown-command';
const ERROR_CODE_UNKNOWN = 'unknown';

/**
 * The protocol server. Composes a `Backend` and a `Config`, and implements
 * the service's line protocol.
 * @fires Server#listening
 */
class Server extends EventEmitter {
  /**
   * Constructor
   *
   * @param  {Object} options.instrumenter     An `Instrumenter` instance for monitoring.
   * @param  {Object} options.backend          A `Backend` instance.
   * @param  {Object} options.config           A `Config` instance.
   * @param  {number} options.port             Port to serve on (optional, default 8321).
   */
  constructor(options) {
    super();

    options = options || {};

    invariant(options.backend, 'Must provide options.backend');
    invariant(options.config, 'Must provide options.config');

    this.backend = options.backend;
    this.config = options.config;
    this.instrumenter = options.instrumenter;

    this.port = (options.port !== undefined) ? options.port : DEFAULT_PORT;

    this.currentConnections = 0;
  }

  serve() {
    const server = net.createServer((conn) => {
      const handler = l => this.handleCommand(l);
      const dispatcher = new Dispatcher({ conn, handler });

      const remoteAddr = conn.address();
      const addr = `${remoteAddr.address}:${remoteAddr.port}`;

      debug('connection opened: %s', addr);
      conn.on('error', (err) => {
        debug('connection error: %s: %s', addr, err);
      });

      this.currentConnections += 1;
      this.instrumenter.gaugeCurrentConnections(this.currentConnections);

      carrier.carry(conn, (line) => {
        dispatcher.handle(line);
      });

      this.emit('client-connected', conn);

      conn.on('close', () => {
        debug('connection closed: %s', addr);
        this.currentConnections -= 1;
        this.instrumenter.gaugeCurrentConnections(this.currentConnections);
        this.emit('client-disconnected', conn);
      });
    });

    /**
     * Fired when the server has been bound.
     *
     * @event Server#listening
     * @type {object} The address the server is listening on.
     */
    server.on('listening', () => {
      this.emit('listening', server.address());
    });
    server.listen(this.port);

    return () => server.close();
  }

  async handleCommand(line) {
    debug('received command: "%s"', line);

    const startDate = new Date();
    try {
      const command = Utils.parseCommand(line);
      return this.handleHit(command.operation, startDate);
    } catch (e) {
      let errorCode = ERROR_CODE_UNKNOWN;

      if (e instanceof Errors.UnknownCommandError) {
        errorCode = ERROR_CODE_UNKNOWN_COMMAND;
      }

      this.instrumenter.countError(errorCode);
      return error(`${errorCode} "${e.message}"`);
    }
  }

  /**
   * Evaluates a list of rules, returning the prevailing status.
   * @param {*} rules
   * @param {*} operation
   */
  async evaluateRules(rules, operation) {
    if (!rules.length) {
      throw new Error('Bug: Should always have at least one rule to evaluate.');
    }

    let lastStatus = null;
    for (const rule of rules) {
      debug('hit: operation=%j rule=%j%s', operation, rule, rule.comment);
      const actor = rule.actorField ? (operation[rule.actorField] || '') : '';

      // eslint-disable-next-line no-await-in-loop
      const status = await this.backend.hit(rule.operation,
        actor,
        rule.creditLimit,
        rule.resetSeconds);

      let statusForInstrumenter;
      if (rule.matchPolicy === Constants.MATCH_POLICY_CANARY) {
        statusForInstrumenter = status.isAllowed
          ? Constants.METRICS_STATUS_CANARY_ACCEPTED : Constants.METRICS_STATUS_CANARY_REJECTED;
      } else {
        statusForInstrumenter = status.isAllowed
          ? Constants.METRICS_STATUS_ACCEPTED : Constants.METRICS_STATUS_REJECTED;
      }

      const ruleLabel = (rule && rule.label) ? rule.label : '';
      this.instrumenter.countHit(statusForInstrumenter, ruleLabel);

      lastStatus = status;

      if (rule.matchPolicy === Constants.MATCH_POLICY_STOP) {
        break;
      }
    }

    return lastStatus;
  }

  async handleHit(operation, startDate) {
    const rules = this.config.findRules(operation);
    const status = await this.evaluateRules(rules, operation);
    this.instrumenter.timeHit(startDate);

    return ok(
      `${!!status.isAllowed} ${status.currentCredit} ${status.nextResetSeconds}`
    );
  }

  static getMatchType(rule) {
    if (rule === null) {
      return 'none';
    }

    const numKeys = Object.keys(rule).length;
    return numKeys > 0 ? 'rule' : 'default';
  }
}

module.exports = Server;
