import { config } from './config.js';
import { createApp } from './app.js';
import { prisma } from './lib/prisma.js';
import { log } from './lib/logger.js';

const app = createApp();
const server = app.listen(config.port, () => {
  console.info(`[server] Dhaaga Bazaar API listening on http://localhost:${config.port} (${config.env})`);
  if (config.fixturesVisible) console.warn('[server] DEVELOPMENT FIXTURES ARE VISIBLE. Never enable this in production.');
});
// Keep idle connections open longer than the proxy in front of us (load balancers typically
// use 60 s; the Vite dev proxy reuses sockets too). Node's 5 s default lets the server close a
// socket at the moment the proxy reuses it, which surfaces as ECONNRESET / hung requests.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

async function shutdown(signal: string) {
  console.info(`[server] ${signal} received, shutting down`);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => log('error', 'unhandled promise rejection', { error: String((reason as Error)?.stack ?? reason) }));
process.on('uncaughtException', (err) => {
  log('error', 'uncaught exception — exiting', { error: err.stack });
  process.exit(1); // let the process manager restart a clean instance
});
process.on('SIGTERM', () => void shutdown('SIGTERM'));
