/**
 * Server lifecycle: start, and graceful shutdown.
 *
 * On shutdown the service first reports not-ready (so a load balancer stops
 * routing new traffic), then stops accepting connections and waits for
 * in-flight requests to finish, then exits. A hard timeout makes sure a
 * stuck connection can't block a deploy forever.
 */

import http from 'node:http';
import { createApp } from './app.js';

/**
 * @param {ReturnType<import('./config.js').loadConfig>} config
 * @param {ReturnType<import('./logger.js').createLogger>} logger
 */
export async function startServer(config, logger) {
  let ready = true;
  const app = createApp({ maxN: config.maxN, logger, isReady: () => ready });

  const server = http.createServer(app);
  server.requestTimeout = config.requestTimeoutMs;
  server.headersTimeout = Math.min(config.requestTimeoutMs, 60_000);
  server.keepAliveTimeout = 5_000;

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : config.port;
  logger.info('server started', { host: config.host, port, maxN: config.maxN });

  let closing;
  async function close() {
    if (closing) return closing;
    ready = false;
    closing = new Promise((resolve) => {
      const timer = setTimeout(() => {
        logger.warn('shutdown timeout reached, closing open connections');
        server.closeAllConnections();
      }, config.shutdownTimeoutMs);
      timer.unref();

      server.close(() => {
        clearTimeout(timer);
        logger.info('server stopped');
        resolve();
      });
      server.closeIdleConnections();
    });
    return closing;
  }

  return { server, port, close };
}
