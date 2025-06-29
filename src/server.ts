import dotenv from 'dotenv';

// Load environment variables FIRST before any other imports
dotenv.config();

import { app, httpServer } from './app';
import { validateEnvironment } from './config/environment';
import { startScheduler } from './jobs/scheduler';

// =====================================================
// INITIALIZATION
// =====================================================

// Validate environment variables
const config = validateEnvironment();

// Start background jobs
startScheduler();

// =====================================================
// SERVER START
// =====================================================

const PORT = config.server.port;

httpServer.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
}); 