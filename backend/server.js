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
const runtimeAdapter = require('./src/services/agentRuntimeAdapter');
const workspaceSnapshotStore = require('./src/services/workspaceSnapshotStore');
const { terminatePid, processMatches } = require('./src/services/processTermination');
const circuitBreaker = require('./src/services/circuitBreaker');

const PORT = process.env.PORT || 4000;

async function startServer() {
  if (cluster.isPrimary) {
    console.log(`[GenOS Cluster] Primary ${process.pid} is running`);
    
    // Fork workers for each CPU core (cap at 4 to preserve resources for LLMs)
    const numCPUs = Math.min(os.cpus().length, 4);
    const jobWorkerPids = new Set();
    const workers = new Set();
    let shuttingDown = false;
    for (let i = 0; i < numCPUs; i++) {
      const worker = cluster.fork({ GENOS_JOB_WORKER: i === 0 ? '1' : '0' });
      workers.add(worker);
      if (i === 0) jobWorkerPids.add(worker.process.pid);
    }

    cluster.on('exit', (worker, code, signal) => {
      workers.delete(worker);
      if (shuttingDown) return;
      console.log(`[GenOS Cluster] Worker ${worker.process.pid} died. Booting replacement...`);
      const wasJobWorker = jobWorkerPids.delete(worker.process.pid);
      const replacement = cluster.fork({ GENOS_JOB_WORKER: wasJobWorker ? '1' : '0' });
      workers.add(replacement);
      if (wasJobWorker) jobWorkerPids.add(replacement.process.pid);
    });

    const shutdownPrimary = (signal) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`[GenOS Cluster] Received ${signal}; stopping ${workers.size} workers.`);
      for (const worker of workers) worker.process.kill(signal);
    };
    process.once('SIGTERM', shutdownPrimary);
    process.once('SIGINT', shutdownPrimary);
    
    if (process.env.GENOS_ENABLE_AUTOSTART === '1') {
      enableGriotAutostart();
    }
    return;
  }

  // Worker Process Logic
  try {
    // 1. Initialize SQLite Database & Schema (WAL mode allows concurrent processes!)
    console.log(`[GenOS Backend] Worker ${process.pid} connecting to SQLite...`);
    const db = await getDatabase();
    await circuitBreaker.hydrateToolLocks(db);
    await runtimeAdapter.reconcilePersistedRuntimes(db);
    const detachedTable = await db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'detached_processes'");
    if (detachedTable) {
      const detached = await db.all('SELECT id, pid, command FROM detached_processes');
      for (const row of detached) {
        let alive = true;
        try { process.kill(Number(row.pid), 0); } catch (_) { alive = false; }
        const matches = alive && processMatches(row.pid, row.command);
        const terminated = matches ? terminatePid(row.pid) : false;
        if (!alive || (matches && terminated)) {
          await db.run('DELETE FROM detached_processes WHERE id = ?', row.id);
        } else {
          console.warn(`[GenOS Recovery] Could not terminate detached process ${row.pid}; retaining its recovery record.`);
        }
      }
    }
    await require('./src/services/agentWorkspaceLifecycleService').reconcileWorkspaceCleanup(db);
    await require('./src/services/workspaceSnapshotStore').reconcileSnapshotArtifacts(db).catch((error) => {
      console.warn(`[GenOS Backend] Snapshot artifact reconciliation skipped: ${error.message}`);
    });
    if (process.env.GENOS_JOB_WORKER === '1') { // One explicitly assigned worker processes background jobs.
        jobWorker.startJobWorker();
    }
    const { count } = await db.get(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    );
    console.log(`[GenOS Backend] SQLite database & ${count} tables ready.`);

    // 2. Create Express App
    const app = createApp();
    const server = http.createServer(app);
    let grpcServer = null;

    // 2.5 Create gRPC Server (Microservices Architecture)
    if (process.env.GENOS_JOB_WORKER === '1') {
      const grpc = require('@grpc/grpc-js');
      const loadAllProtos = require('./proto/index.js');
      const registerAllServices = require('./src/grpc_services/index.js');
      const { readPrivateTlsPair } = require('./src/services/tlsConfig');
      
      const protoDescriptors = loadAllProtos();
      grpcServer = new grpc.Server();
      
      // Auto-register all microservices and core services
      for (const [serviceName, descriptor] of Object.entries(protoDescriptors)) {
        registerAllServices(grpcServer, descriptor);
      }
      
      const GRPC_PORT = process.env.GRPC_PORT || 50051;
      const tlsKey = process.env.GENOS_GRPC_TLS_KEY;
      const tlsCert = process.env.GENOS_GRPC_TLS_CERT;
      const tlsPair = readPrivateTlsPair(tlsKey, tlsCert);
      const bindAddress = process.env.GRPC_BIND_ADDRESS || (tlsPair ? '0.0.0.0' : '127.0.0.1');
      const loopback = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
      if (!tlsPair && !loopback.has(bindAddress)) {
        throw new Error('Refusing insecure gRPC on a non-loopback bind address; configure GENOS_GRPC_TLS_KEY/CERT.');
      }
      const credentials = tlsPair
        ? grpc.ServerCredentials.createSsl(null, [tlsPair], false)
        : grpc.ServerCredentials.createInsecure();
      await new Promise((resolve, reject) => {
        grpcServer.bindAsync(`${bindAddress}:${GRPC_PORT}`, credentials, (err, boundPort) => {
          if (err) return reject(new Error(`gRPC bind failed on ${bindAddress}:${GRPC_PORT}: ${err.message}`));
          grpcServer.start();
          console.log(`[GenOS gRPC] Microservices & Core services listening on port ${boundPort}`);
          resolve();
        });
      });
    }

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

    let shuttingDown = false;
    const shutdown = async (signal) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`[GenOS Backend] Received ${signal}; draining requests.`);
      await jobWorker.stopJobWorker({ drain: true, timeoutMs: 30000 });
      await telemetry.flush(5000);
      if (grpcServer) await new Promise((resolve) => grpcServer.tryShutdown(() => resolve()));
      await new Promise((resolve) => server.close(() => resolve()));
      await telemetry.flush(1000);
      await closeDatabase();
      console.log('[GenOS Backend] Shutdown complete.');
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
