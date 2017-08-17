const redis = require('redis');
const url = require('url');

const Backend = require('./src/backend');
const Config = require('./src/config');
const Instrumenter = require('./src/instrumenter');
const Server = require('./src/server');
const WebServer = require('./src/webserver');

/* eslint-disable no-console */

const configFile = process.argv[2];
if (!configFile) {
  console.log('Error: must provide config file as an argument.');
  process.exit(1);
}

const config = Config.fromIniFile(configFile);

const redisPort = parseInt(process.env.REDIS_PORT, 10) || 6379;
const redisHost = process.env.REDIS_HOST || 'localhost';
const redisClient = redis.createClient(redisPort, redisHost);
const backend = new Backend({ redisClient });

const httpServicePort = process.env.HTTP_SERVICE_PORT;
const prometheusMetricsPath = process.env.PROMETHEUS_METRICS_PATH;

const server = new Server({
  instrumenter: new Instrumenter({
    statsdHost: process.env.STATSD_HOST,
    statsdPort: parseInt(process.env.STATSD_PORT, 10),
    statsdPrefix: process.env.STATSD_PREFIX || '',
    statsdUseTcp: !!process.env.STATSD_USE_TCP,
  }),
  backend,
  config,
  port: process.env.PORT,
});

backend.initialize().then(() => {
  console.log(`Listening on port TCP port ${server.port}, Redis host ${redisHost}:${redisPort}`);

  if (httpServicePort && prometheusMetricsPath) {
    WebServer.createAndServe({
      port: parseInt(httpServicePort, 10),
      metricsPath: prometheusMetricsPath,
    });

    const metricsLocation = url.format({
      protocol: 'http',
      hostname: '127.0.0.1',
      port: httpServicePort,
      pathname: prometheusMetricsPath.startsWith('/') ? prometheusMetricsPath : `/${prometheusMetricsPath}`,
    });

    console.log(`Serving prometheus metrics at ${metricsLocation}`);
  } else if (httpServicePort || prometheusMetricsPath) {
    console.warn(`Only found one of HTTP_SERVICE_PORT / PROMETHEUS_METRICS_PATH. Check your environment.`);
  }

  server.serve();
});
