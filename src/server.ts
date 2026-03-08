import dotenv from 'dotenv';

dotenv.config();

import { app, httpServer } from './app';
import { validateEnvironment } from './config/environment';
import { startScheduler, stopScheduler } from './jobs/scheduler';
import { logger } from './shared/utils/logger';

const config = validateEnvironment();

startScheduler();

const PORT = config.server.port;

httpServer.setTimeout(30000);

httpServer.listen(PORT, () => {
  logger.info({ port: PORT }, 'Backend server running');
  logger.info({ env: process.env.NODE_ENV || 'development' }, 'Environment');
});

function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down gracefully');
  stopScheduler();
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT')); 