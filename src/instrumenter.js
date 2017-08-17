const PrometheusClient = require('prom-client');
const StatsdClient = require('statsd-client');

class Instrumenter {
  /**
   * Encapsulates support for various monitoring backends that are supported by Divvy.
   * The list of supported backends currently includes statsd and prometheus.
   *
   * @param {Object}   options
   * @param {string=}  options.statsdHost    Statsd hostname for metrics (optional, no default).
   * @param {number=}  options.statsdPort    Statsd port (optional, no default).
   * @param {string=}  options.statsdPrefix  Prefix to use with statsd metrics (default '');
   * @param {boolean=} options.statsdUseTcp  If truthy, use a TCP statsd client instead of UDP.
   */
  constructor(options) {
    this.options = options;
    this.initStatsd();
    this.initPrometheus();
  }

  /**
   * Instantiate a new StatsdClient. If no statsd configuration is specified, this
   * creates an object with the same interface but all of the methods are no-ops.
   */
  initStatsd() {
    if (this.options.statsdHost && this.options.statsdPort) {
      this.statsd = new StatsdClient({
        host: this.options.statsdHost,
        port: this.options.statsdPort,
        prefix: this.options.statsdPrefix || '',
        tcp: !!this.options.statsdUseTcp,
      });
    } else {
      this.statsd = {
        increment() {},
        gauge() {},
        timing() {},
      };
    }
  }

  /**
   * Register all of the Prometheus metrics to be used by divvy. These are exposed
   * as instance properties so we can easily clear and re-create them when testing.
   */
  initPrometheus() {
    this.tcpConnectionsCounter = new PrometheusClient.Gauge({
      name: 'divvy_tcp_connections_total',
      help: 'Total number of open TCP connections to Divvy.',
    });

    this.hitDurationHistogram = new PrometheusClient.Histogram({
      name: 'divvy_hit_duration_seconds',
      help: 'Histogram of Divvy processing time for HITs.',
    });

    this.hitCounter = new PrometheusClient.Counter({
      name: 'divvy_hits_total',
      help: 'Counter of total HITs to Divvy.',
      labelNames: ['status', 'type'],
    });

    this.errorCounter = new PrometheusClient.Counter({
      name: 'divvy_errors_total',
      help: 'Counter of total Divvy errors.',
      labelNames: ['code'],
    });
  }

  /**
   * Record the current number of open TCP connections.
   * @param {number} connections
   */
  gaugeCurrentConnections(connections) {
    if (typeof connections === 'number') {
      this.statsd.gauge('connections', connections);
      this.tcpConnectionsCounter.set(connections);
    }
  }

  /**
   * Record the duration of a HIT operation
   * @param {Date} start When the HIT request was received.
   */
  timeHit(start) {
    const seconds = (Date.now() - start.valueOf()) / 1000;
    this.statsd.timing('hit', start);
    this.hitDurationHistogram.observe(seconds);
  }

  /**
   * Record a HIT operation.
   * @param {string} status The status of the hit, either "accepted" or "rejected".
   * @param {string} type   The match type, either "rule", "default", or "none".
   */
  countHit(status, type) {
    this.statsd.increment(`hit.${status}`);
    this.statsd.increment(`hit.${status}.${type}`);
    this.hitCounter.labels(status, type).inc();
  }

  /**
   * Record an error.
   * @param {string} code The divvy error code.
   */
  countError(code) {
    this.statsd.increment(`error.${code}`);
    this.errorCounter.labels(code).inc();
  }
}

module.exports = Instrumenter;
