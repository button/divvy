const debug = require('debug')('divvy');

const EventEmitter = require('events');
const net = require('net');
const carrier = require('carrier');
const Errors = require('./errors');
const Utils = require('./utils');
const invariant = Utils.invariant;

const DEFAULT_PORT = 8321;

const STATUS_OK = 'OK';
const STATUS_ERROR = 'ERR';

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
      const remoteAddr = conn.address();
      const addr = `${remoteAddr.address}:${remoteAddr.port}`;

      debug('connection opened: %s', addr);
      conn.on('error', (err) => {
        debug('connection error: %s: %s', addr, err);
      });

      this.currentConnections += 1;
      this.instrumenter.gaugeCurrentConnections(this.currentConnections);

      carrier.carry(conn, (line) => {
        this.handleCommand(line, conn);
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
  }

  handleCommand(line, conn) {
    debug('received command: "%s"', line);
    if (!line) {
      return;
    }

    const startDate = new Date();
    try {
      const command = Utils.parseCommand(line);
      this.handleHit(conn, command.operation, startDate);
    } catch (e) {
      if (e instanceof Errors.UnknownCommandError) {
        this.sendError(conn, ERROR_CODE_UNKNOWN_COMMAND, e.message);
      } else {
        this.sendError(conn, ERROR_CODE_UNKNOWN, e.message);
      }
    }
  }

  handleHit(conn, operation, startDate) {
    const rule = this.config.findRule(operation);
    debug('hit: operation=%j rule=%j%s', operation, rule,
      (rule && rule.comment) ? ` (${rule.comment})` : '');

    let oper;
    if (!rule) {
      oper = Promise.resolve({
        isAllowed: false,
        currentCredit: 0,
        nextResetSeconds: -1,
      });
    } else {
      const actor = rule.actorField ?
        (operation[rule.actorField] || '') : '';

      oper = this.backend.hit(rule.operation,
        actor,
        rule.creditLimit,
        rule.resetSeconds
      );
    }

    return oper.then((status) => {
      this.sendStatus(conn, STATUS_OK,
        `${!!status.isAllowed} ${status.currentCredit} ${status.nextResetSeconds}`);
      this.instrumenter.timeHit(startDate);
      const result = status.isAllowed ? 'accepted' : 'rejected';
      const matchType = Server.getMatchType(rule);
      const ruleLabel = rule && rule.label ? rule.label : '';
      this.instrumenter.countHit(result, matchType, ruleLabel);
    }).catch((err) => {
      this.sendError(conn, `Server error: ${err}`);
    });
  }

  sendError(conn, errorCode, errorMessage) {
    this.sendStatus(conn, STATUS_ERROR, `${errorCode} "${errorMessage}"`);
    this.instrumenter.countError(errorCode);
  }

  sendStatus(conn, status, message) {
    // Don't write if the socket is not writable. This is the case
    // when the connection closes between event loop ticks (i.e. while a
    // backend response is being fulfilled).
    if (conn.writable) {
      conn.write(`${status} ${message}\n`);
    }
    if (status === STATUS_ERROR || !conn.writable) {
      conn.destroy();
    }
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
