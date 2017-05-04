

const redis = require('redis');
const Backend = require('./src/backend');
const Config = require('./src/config');
const Server = require('./src/server');

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

const server = new Server({
  backend,
  config,
  port: process.env.PORT,
  statsdHost: process.env.STATSD_HOST,
  statsdPort: parseInt(process.env.STATSD_PORT, 10),
  statsdPrefix: process.env.STATSD_PREFIX || '',
  statsdUseTcp: !!process.env.STATSD_USE_TCP,
});

backend.initialize().then(() => {
  console.log(`Listening on port TCP port ${server.port}, Redis host ${redisHost}:${redisPort}`);
  server.serve();
});
