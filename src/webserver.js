const http = require('http');
const PrometheusClient = require('prom-client');

const { invariant } = require('./utils');

class WebServer {
  /**
   * @param {Object} options
   * @param {number} options.port The port to listen on.
   * @param {string} options.metricsPath The path to expose prometheus metrics at.
   * @return {WebServer}
   */
  constructor(options) {
    invariant(options.port !== undefined, 'Must provide options.port');
    invariant(options.metricsPath, 'Must provide options.metricsPath');
    this.options = options;
    this.server = http.createServer(this.handleRequest.bind(this));
  }

  /**
   * Create a new WebServer and start listening on the specified port.
   * @param {Object} options
   * @param {number} options.port The port to listen on.
   * @param {string} options.metricsPath The path to expose prometheus metrics at.
   * @return {WebServer}
   */
  static createAndServe(options) {
    const server = new WebServer(options);
    server.serve();
    return server;
  }

  serve() {
    this.server.listen(this.options.port);
  }

  handleRequest(request, response) {
    if (request.url !== this.options.metricsPath) {
      response.writeHead(404);
      response.end();
      return;
    }

    response.end(PrometheusClient.register.metrics());
  }
}

module.exports = WebServer;
