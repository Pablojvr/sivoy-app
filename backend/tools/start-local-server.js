const { assertLocalDatabaseUrl } = require('./import-public-catalog');

const DEFAULT_DATABASE_URL = 'postgresql://sivoy:sivoy_local_only@127.0.0.1:5433/sivoy';
const LOCAL_FRONTEND_URLS = [
  'http://127.0.0.1:4303',
  'http://localhost:4303',
  'http://127.0.0.1:4200',
  'http://localhost:4200'
].join(',');

function configureLocalEnvironment(env) {
  if (!env || typeof env !== 'object' || Array.isArray(env)) {
    throw new TypeError('environment must be an object');
  }
  env.NODE_ENV = 'development';
  env.PORT = env.PORT || '3001';
  env.DATABASE_URL = assertLocalDatabaseUrl(env.DATABASE_URL || DEFAULT_DATABASE_URL);
  env.DATABASE_SSL = 'false';
  env.FRONTEND_URL = LOCAL_FRONTEND_URLS;
  return env;
}

async function runLocalServer() {
  configureLocalEnvironment(process.env);
  const { startServer } = require('../server');
  const { closeDB } = require('../src/config/database');
  const { createProcessLogger } = require('../src/core/observability/process-logger');
  const { registerShutdownHandlers } = require('../src/core/lifecycle/shutdown');

  const server = await startServer();
  if (server) {
    registerShutdownHandlers({
      server,
      closeDatabase: closeDB,
      logger: createProcessLogger({ entryPoint: 'server' })
    });
  }
  return server;
}

if (require.main === module) {
  runLocalServer().catch(() => {
    process.stderr.write('Local server failed to start.\n');
    process.exitCode = 1;
  });
}

module.exports = {
  configureLocalEnvironment,
  runLocalServer
};
