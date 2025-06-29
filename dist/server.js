"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables FIRST before any other imports
dotenv_1.default.config();
const app_1 = require("./app");
const environment_1 = require("./config/environment");
const scheduler_1 = require("./jobs/scheduler");
// =====================================================
// INITIALIZATION
// =====================================================
// Validate environment variables
const config = (0, environment_1.validateEnvironment)();
// Start background jobs
(0, scheduler_1.startScheduler)();
// =====================================================
// SERVER START
// =====================================================
const PORT = config.server.port;
app_1.httpServer.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
