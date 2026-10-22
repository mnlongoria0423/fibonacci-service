#!/usr/bin/env node
/**
 * Process entry point: load config, start the server, wire up signals.
 * Kept deliberately thin; everything testable lives in other modules.
 */

import { ConfigError, loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { startServer } from './server.js';

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`Configuration error: ${err.message}\n`);
      process.exit(78); // EX_CONFIG
    }
    throw err;
  }

  const logger = createLogger({ level: config.logLevel, base: { service: 'fibonacci-service' } });
  const { close } = await startServer(config, logger);

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, async () => {
      logger.info('shutdown signal received', { signal });
      await close();
      process.exit(0);
    });
  }

  process.on('unhandledRejection', (err) => {
    logger.error('unhandled rejection', { err });
    process.exit(1);
  });
}

main().catch((err) => {
  process.stderr.write(`Fatal error during startup: ${err?.stack ?? err}\n`);
  process.exit(1);
});
