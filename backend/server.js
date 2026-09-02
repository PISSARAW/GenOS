/**
 * GenOS Studio Backend Server Entry Point
 * Boots SQLite persistence and starts HTTP server.
 */

const http = require('http');
const cluster = require('cluster');
const os = require('os');
const { createApp } = require('./src/app');
const { getDatabase, closeDatabase } = require('./src/db');
const telemetry = require('./src/services/telemetryObserver');
const jobWorker = require('./src/services/jobWorker');
const { enableGriotAutostart } = require('./src/services/griotAutostart');

const PORT = process.env.PORT || 4000;

async function startServer() {
  if (cluster.isPrimary) {
    console.log(`[GenOS Cluster] Primary ${process.pid} is running`);
    
    // Fork workers for each CPU core (cap at 4 to preserve resources for LLMs)
    const numCPUs = Math.min(os.cpus().length, 4);
    for (let i = 0; i < numCPUs; i++) {
      cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
      console.log(`[GenOS Cluster] Worker ${worker.process.pid} died. Booting replacement...`);
      cluster.fork();
    });
    
    enableGriotAutostart();
    return;
  }

  // Worker Process Logic
  try {
    // 1. Initialize SQLite Database & Schema (WAL mode allows concurrent processes!)
    console.log(`[GenOS Backend] Worker ${process.pid} connecting to SQLite...`);
    const db = await getDatabase();
    if (cluster.worker.id === 1) { // Only worker 1 processes background jobs to prevent duplicate jobs
        jobWorker.startJobWorker();
    }
    const { count } = await db.get(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    );
    console.log(`[GenOS Backend] SQLite database & ${count} tables ready.`);

    // 2. Create Express App
    const app = createApp();
    const server = http.createServer(app);

    // 2.5 Create gRPC Server
    const grpc = require('@grpc/grpc-js');
    const protoLoader = require('@grpc/proto-loader');
    const path = require('path');
    const vectorMemoryService = require('./src/services/vectorMemoryService');

    const PROTO_PATH = path.resolve(__dirname, 'proto/genos.proto');
    const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
      keepCase: true, longs: String, enums: String, defaults: true, oneofs: true
    });
    const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
    
    const grpcServer = new grpc.Server();
    grpcServer.addService(protoDescriptor.genos.MemoryService.service, {
      SearchMemory: async (call, callback) => {
        try {
          const results = await vectorMemoryService.searchMemory(call.request.query, { limit: call.request.limit }, db);
          const mapped = (results.allScoredExperiences || []).map(r => ({
            id: r.id, title: r.title, summary: r.summary, score: r.similarityScore || 0
          }));
          callback(null, { results: mapped });
        } catch (err) {
          callback(err, null);
        }
      }
    });

    const GRPC_PORT = 50051;
    grpcServer.bindAsync(`0.0.0.0:${GRPC_PORT}`, grpc.ServerCredentials.createInsecure(), () => {
       grpcServer.start();
       console.log(`[GenOS gRPC] MemoryService listening on port ${GRPC_PORT}`);
    });

    // 3. Start Listening (Express)
    server.listen(PORT, () => {
      console.log(`[GenOS Full-Stack] Server running on port ${PORT}`);
      telemetry.emitEvent({
        eventType: 'SERVER_BOOT',
        agentId: 'system',
        action: 'BOOT',
        detail: `GenOS Backend operational on port ${PORT}`,
        severity: 'info'
      });
    });

    const shutdown = async (signal) => {
      console.log(`[GenOS Backend] Received ${signal}; draining requests.`);
      jobWorker.stopJobWorker();
      server.close(async () => {
        await closeDatabase();
        console.log('[GenOS Backend] Shutdown complete.');
      });
    };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);

    return { app, server, db };
  } catch (err) {
    console.error('[GenOS Backend] Fatal boot error:', err);
    process.exit(1);
  }
}


if (require.main === module) {
  startServer();
}

module.exports = { startServer };
