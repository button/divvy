/* eslint-disable no-await-in-loop */
const debug = require('debug')('divvy');
const { invariant } = require('./utils');

const STATUS_OK = 'OK';
const STATUS_ERROR = 'ERR';
const STATUSES = new Set([STATUS_OK, STATUS_ERROR]);

const makeResult = status => message => ({ status, message });

/**
 * ok and error are functions that accept a string as input and return a
 * { status, message } tuple understandable to a Dispatcher. These may be used
 * for return values from handler functions.
 */
const ok = makeResult(STATUS_OK);
const error = makeResult(STATUS_ERROR);

/**
 * A Dispatcher wraps a socket and ensures requests are responded to in the
 * exact order that they're received. Additionally, it ensures responses are
 * formatted according to the Divvy protocol.
 *
 * When a new connection is created, you can instantiate a Dispatcher with the
 * socket and a request handler. The request handler is expected to accept a
 * single request line and return a promise that either:
 *
 *   * Resolves with a { status, message } tuple or
 *   * Rejects with an Error
 *
 * When the connection receives a line, forward it to the dispatcher via the
 * #handle method. This will take care to invoke the handler function, and
 * ensure responses get written in-order and according to the divvy protocol.
 *
 * Future improvements could include:
 *
 *   * Taking on more of the connection management (e.g, reading)
 *   * More timing metrics (end-to-end processing time of a request)
 *   * Limits on the amount of requests we'll queue against a socket
 *   * Limits on the amount of in-flight requests being actively being
 *     processed.
 *   * Handler timeouts
 */
class Dispatcher {
  /**
   * @param  {net.Socket} options.conn
   * @param  {string => Promise} options.handler
   * @return {Dispatcher}
   */
  constructor({ conn, handler } = {}) {
    invariant(!!conn, 'Must provide conn to Dispatcher');
    invariant(typeof handler === 'function', 'Must provide handler function to Dispatcher');

    this.conn = conn;
    this.handler = handler;
    this.queue = [];
    this.flushing = false;
  }

  /**
   * Process a request line. This will invoke the handler function and ensure
   * a response is written to the socket in the order requests are received.
   *
   * @param  {string} line
   */
  handle(line) {
    let p;
    try {
      p = Promise.resolve(this.handler(line));
    } catch (e) {
      p = Promise.reject(e);
    }

    // We apply the catch handler early to convince node that rejections won't
    // go uncaught.
    p = p.catch(e => error(`Internal Error: ${e.message}`));

    this.queue.push(p);
    return this.flush();
  }

  /**
   * @private
   */
  async flush() {
    if (this.flushing) {
      return;
    }

    debug('beginning dispatch flush');
    this.flushing = true;

    while (this.queue.length) {
      const { status, message } = await this.queue.shift();
      this.write(status, message);
    }

    debug('finishing dispatch flush');
    this.flushing = false;
  }

  /**
   * @private
   */
  write(status, message) {
    // Don't write if the socket is not writable. This is the case
    // when the connection closes between event loop ticks (i.e. while a
    // backend response is being fulfilled).
    if (!this.conn.writable) {
      this.destroy();
      return;
    }

    if (!STATUSES.has(status)) {
      message = `Internal Error: Unknown status (${status})`;
      status = STATUS_ERROR;
    }

    if (typeof message !== 'string') {
      message = `Internal Error: Invalid message type (${typeof message})`;
      status = STATUS_ERROR;
    }

    if (message.includes('\n')) {
      message = `Internal Error: Message contained newlines`;
      status = STATUS_ERROR;
    }

    debug('writing %s response to socket', status);
    this.conn.write(`${status} ${message}\n`);

    if (status === STATUS_ERROR) {
      this.destroy();
    }
  }

  /**
   * @private
   */
  destroy() {
    this.conn.destroy();
  }
}

module.exports = { Dispatcher, ok, error };
