/**
 * GenOS Express Application Setup
 * Modular middleware pipeline and route configuration.
 */

const express = require('express');
const cors = require('cors');

// Security & Error Middlewares
const { securityHeaders, originCheck, csrfCheck, xssSanitizer, ALLOWED_ORIGINS } = require('./middleware/security');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Route Modules
const authRoutes = require('./routes/authRoutes');
const configRoutes = require('./routes/configRoutes');
const deployRoutes = require('./routes/deployRoutes');
const telemetryRoutes = require('./routes/telemetryRoutes');
const commandRoutes = require('./routes/commandRoutes');
const workspaceRoutes = require('./routes/workspaceRoutes');
const experimentRoutes = require('./routes/experimentRoutes');
const lineageRoutes = require('./routes/lineageRoutes');
const trajectoryRoutes = require('./routes/trajectoryRoutes');
const swarmRoutes = require('./routes/swarmRoutes');
const mcpRoutes = require('./routes/mcpRoutes');
const incidentRoutes = require('./routes/incidentRoutes');
const securityRoutes = require('./routes/securityRoutes');
const arenaRoutes = require('./routes/arenaRoutes');
const resilienceRoutes = require('./routes/resilienceRoutes');
const memoryRoutes = require('./routes/memoryRoutes');
const platformRoutes = require('./routes/platformRoutes');
const evaluationRoutes = require('./routes/evaluationRoutes');
const complianceRoutes = require('./routes/complianceRoutes');
const ideRoutes = require('./routes/ideRoutes');
const schemaRoutes = require('./routes/schemaRoutes');
const strategyRoutes = require('./routes/strategyRoutes');
const workflowRoutes = require('./routes/workflowRoutes');
const promptRoutes = require('./routes/promptRoutes');
const traceRoutes = require('./routes/traceRoutes');
const evalRoutes = require('./routes/evalRoutes');
const ragRoutes = require('./routes/ragRoutes');
const integrationRoutes = require('./routes/integrationRoutes');

function createApp() {
  const app = express();

  // 1. CORS Configuration
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        const err = new Error('Cross-Origin Request Blocked by GenOS Security Policy');
        err.status = 403;
        err.code = 'FORBIDDEN_ORIGIN';
        callback(err);
      }
    },
    credentials: true
  }));

  // 2. Request Parsing & Security Headers
  app.use(express.json({ limit: '10mb' }));
  app.use(securityHeaders);
  app.use(originCheck);
  app.use(csrfCheck);
  app.use(xssSanitizer);

  // 3. Mount Modular API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/workspaces', workspaceRoutes);
  app.use('/api/workflows', workflowRoutes);
  app.use('/api/prompts', promptRoutes);
  app.use('/api/traces', traceRoutes);
  app.use('/api/evals', evalRoutes);
  app.use('/api/rag', ragRoutes);
  app.use('/api/integrations', integrationRoutes);
  app.use('/api/experiments', experimentRoutes);
  app.use('/api/trajectories', trajectoryRoutes);
  app.use('/api/swarm', swarmRoutes);
  app.use('/api/arena', arenaRoutes);
  app.use('/api/resilience', resilienceRoutes);
  app.use('/api/memory', memoryRoutes);
  app.use('/api', platformRoutes);
  app.use('/api/evaluation', evaluationRoutes);
  app.use('/api/compliance', complianceRoutes);
  app.use('/api/ide', ideRoutes);
  app.use('/api/strategies', strategyRoutes);
  app.use('/api', schemaRoutes);

  // Root /api scoped route aggregators
  app.use('/api', configRoutes);
  app.use('/api', deployRoutes);
  app.use('/api', telemetryRoutes);
  app.use('/api', commandRoutes);
  app.use('/api', lineageRoutes);
  app.use('/api', mcpRoutes);
  app.use('/api', incidentRoutes);
  app.use('/api', securityRoutes);

  // 4. Error Handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
