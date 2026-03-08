"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const app_1 = require("./app");
const environment_1 = require("./config/environment");
const scheduler_1 = require("./jobs/scheduler");
const logger_1 = require("./shared/utils/logger");
const config = (0, environment_1.validateEnvironment)();
(0, scheduler_1.startScheduler)();
const PORT = config.server.port;
app_1.httpServer.setTimeout(30000);
app_1.httpServer.listen(PORT, () => {
    logger_1.logger.info({ port: PORT }, 'Backend server running');
    logger_1.logger.info({ env: process.env.NODE_ENV || 'development' }, 'Environment');
});
function shutdown(signal) {
    logger_1.logger.info({ signal }, 'Shutting down gracefully');
    (0, scheduler_1.stopScheduler)();
    app_1.httpServer.close(() => {
        logger_1.logger.info('Server closed');
        process.exit(0);
    });
    setTimeout(() => {
        logger_1.logger.error('Forced shutdown after timeout');
        process.exit(1);
    }, 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
