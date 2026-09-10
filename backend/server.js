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
const { readPort } = require('./src/services/runtimeConfig');
const trinityMonitorServer = require('./src/services/trinityMonitorServer');

const PORT = readPort('PORT', process.env.PORT, 4000);

function forkClusterWorker(isJobWorker) {
  return cluster.fork({ GENOS_JOB_WORKER: isJobWorker ? '1' : '0' });
}

function bootstrapClusterWorkers(numCPUs) {
  const workers = new Set();
  const jobWorkerPids = new Set();
  for (let i = 0; i < numCPUs; i += 1) {
    const worker = forkClusterWorker(i === 0);
    workers.add(worker);
    if (i === 0) jobWorkerPids.add(worker.process.pid);
  }
  return { workers, jobWorkerPids };
}

// Re-forks a worker with the same job-worker role whenever one dies unexpectedly.
function registerClusterLifecycle(workers, jobWorkerPids) {
  const state = { shuttingDown: false };

  cluster.on('exit', (worker) => {
    workers.delete(worker);
    if (state.shuttingDown) return;
    console.log(`[GenOS Cluster] Worker ${worker.process.pid} died. Booting replacement...`);
    const wasJobWorker = jobWorkerPids.delete(worker.process.pid);
    const replacement = forkClusterWorker(wasJobWorker);
    workers.add(replacement);
    if (wasJobWorker) jobWorkerPids.add(replacement.process.pid);
  });

  const shutdownPrimary = (signal) => {
    if (state.shuttingDown) return;
    state.shuttingDown = true;
    console.log(`[GenOS Cluster] Received ${signal}; stopping ${workers.size} workers.`);
    for (const worker of workers) worker.process.kill(signal);
  };
  process.once('SIGTERM', shutdownPrimary);
  process.once('SIGINT', shutdownPrimary);
}

function runPrimaryProcess() {
  console.log(`[GenOS Cluster] Primary ${process.pid} is running`);
  // Fork workers for each CPU core (cap at 4 to preserve resources for LLMs)
  const numCPUs = Math.min(os.cpus().length, 4);
  const { workers, jobWorkerPids } = bootstrapClusterWorkers(numCPUs);
  registerClusterLifecycle(workers, jobWorkerPids);
  if (process.env.GENOS_ENABLE_AUTOSTART === '1') {
    enableGriotAutostart();
  }
}

// Clears any detached_processes rows whose backing OS process is gone or terminable.
async function reconcileDetachedProcesses(db) {
  const detachedTable = await db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'detached_processes'");
  if (!detachedTable) return;
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

async function bootstrapWorkerDatabase() {
  console.log(`[GenOS Backend] Worker ${process.pid} connecting to SQLite...`);
  const db = await getDatabase();
  await circuitBreaker.hydrateToolLocks(db);
  await runtimeAdapter.reconcilePersistedRuntimes(db);
  await reconcileDetachedProcesses(db);
  await require('./src/services/agentWorkspaceLifecycleService').reconcileWorkspaceCleanup(db);
  await workspaceSnapshotStore.reconcileSnapshotArtifacts(db).catch((error) => {
    console.warn(`[GenOS Backend] Snapshot artifact reconciliation skipped: ${error.message}`);
  });
  if (process.env.GENOS_JOB_WORKER === '1') { // One explicitly assigned worker processes background jobs.
    jobWorker.startJobWorker();
  }
  const { count } = await db.get(
    "SELECT COUNT(*) as count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
  );
  console.log(`[GenOS Backend] SQLite database & ${count} tables ready.`);
  return db;
}

// Boots the gRPC microservices server on the designated worker only, or returns null.
async function createGrpcServerIfDesignated() {
  if (process.env.GENOS_JOB_WORKER !== '1') return null;
  const grpc = require('@grpc/grpc-js');
  const loadAllProtos = require('./proto/index.js');
  const registerAllServices = require('./src/grpc_services/index.js');
  const { readPrivateTlsPair } = require('./src/services/tlsConfig');

  const protoDescriptors = loadAllProtos();
  const grpcServer = new grpc.Server();
  for (const [, descriptor] of Object.entries(protoDescriptors)) {
    registerAllServices(grpcServer, descriptor);
  }

  const GRPC_PORT = readPort('GRPC_PORT', process.env.GRPC_PORT, 50051);
  const tlsPair = readPrivateTlsPair(process.env.GENOS_GRPC_TLS_KEY, process.env.GENOS_GRPC_TLS_CERT);
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
  return grpcServer;
}

// Live feed for `genos run --mode trinity --monitor`, gated to the designated worker.
function startTrinityMonitorIfEnabled() {
  if (process.env.GENOS_JOB_WORKER === '1' && process.env.GENOS_TRINITY_MONITOR_ENABLED !== '0') {
    trinityMonitorServer.start();
  }
}

function registerWorkerShutdown(server, grpcServer, db) {
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[GenOS Backend] Received ${signal}; draining requests.`);
    await jobWorker.stopJobWorker({ drain: true, timeoutMs: 30000 });
    await trinityMonitorServer.stop();
    await telemetry.flush(5000);
    if (grpcServer) await new Promise((resolve) => grpcServer.tryShutdown(() => resolve()));
    await new Promise((resolve) => server.close(() => resolve()));
    await telemetry.flush(1000);
    await closeDatabase();
    console.log('[GenOS Backend] Shutdown complete.');
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

async function runWorkerProcess() {
  try {
    const db = await bootstrapWorkerDatabase();
    const app = createApp();
    const server = http.createServer(app);
    const grpcServer = await createGrpcServerIfDesignated();
    startTrinityMonitorIfEnabled();

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

    registerWorkerShutdown(server, grpcServer, db);
    return { app, server, db };
  } catch (err) {
    console.error('[GenOS Backend] Fatal boot error:', err);
    process.exit(1);
  }
}

async function startServer() {
  if (cluster.isPrimary) {
    runPrimaryProcess();
    return;
  }
  return runWorkerProcess();
}


if (require.main === module) {
  startServer();
}

module.exports = { startServer };
