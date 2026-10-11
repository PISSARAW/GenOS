'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { execFileSync } = require('node:child_process');
const sqlite = require('../../backend/node_modules/sqlite');
const sqlite3 = require('../../backend/node_modules/sqlite3');
const { migrateGarageFabric } = require('../../backend/src/db/migrations/migrateGarageFabric');
const store = require('../../backend/src/services/garageQueueStore');
const dispatcher = require('../../backend/src/services/garageQueueDispatcher');

function options(argv) {
  const values = Object.fromEntries(argv.map((arg) => arg.split('=', 2)));
  return { size: integer(values['--size'] || '10', 1),
    samples: integer(values['--samples'] || '12', 1),
    warmup: integer(values['--warmup'] || '3', 0) };
}

function integer(value, minimum) {
  const number = Number(value);
  assert(Number.isSafeInteger(number) && number >= minimum && number <= 1000);
  return number;
}

async function fixture(size) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-garage-bench-'));
  const filename = path.join(directory, 'garage.sqlite');
  process.env.GENOS_DB_PATH = filename;
  process.env.GENOS_DB_BOOTSTRAP_SKIP = '1';
  process.env.GENOS_DB_BACKUP_SKIP = '1';
  const db = await sqlite.open({ filename, driver: sqlite3.Database });
  await db.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;
    CREATE TABLE workspaces(id TEXT PRIMARY KEY, path TEXT, organization_id TEXT, project_id TEXT);
    CREATE TABLE agents(id TEXT PRIMARY KEY, name TEXT, role TEXT, execution_mode TEXT, status TEXT,
      workspace_id TEXT, parent_agent_id TEXT, metadata_json TEXT DEFAULT '{}', is_apoptotic INTEGER DEFAULT 0,
      isolation_mode TEXT DEFAULT 'Branch', about TEXT, current_task TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
  await migrateGarageFabric(db);
  await db.run("INSERT INTO workspaces VALUES ('ws', ?, 'org', 'project')", directory);
  await db.run("INSERT INTO agents(id, name, execution_mode, status, workspace_id) VALUES ('orch', 'Parent', 'orchestrator', 'running', 'ws')");
  await db.exec('BEGIN IMMEDIATE');
  try {
    for (let index = 0; index < size; index++) {
      await db.run(`INSERT INTO agents(id, name, role, execution_mode, status, workspace_id, parent_agent_id)
        VALUES (?, ?, 'implementation', 'worker', 'idle', 'ws', 'orch')`, workerId(index), `Worker ${index}`);
    }
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
  return { db, directory };
}

function workerId(index) { return `worker-${String(index).padStart(4, '0')}`; }
function requestId(index) { return `request-${String(index).padStart(4, '0')}`; }

async function timed(operation) {
  const start = performance.now();
  const result = await operation();
  return { result, ms: performance.now() - start };
}

function percentile(sorted, fraction) {
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}

function metrics(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const totalMs = values.reduce((sum, value) => sum + value, 0);
  return { count: values.length, totalMs, opsPerSecond: values.length * 1000 / totalMs,
    p50Ms: percentile(sorted, 0.5), p95Ms: percentile(sorted, 0.95), p99Ms: percentile(sorted, 0.99) };
}

async function enqueueAll(db, size) {
  const durations = [];
  for (let index = 0; index < size; index++) {
    const request = { requestId: requestId(index), orchestratorId: 'orch', workerId: workerId(index),
      prompt: 'Benchmark deterministic scheduler selection', mode: 'surface', priority: 0.5 };
    const sample = await timed(() => store.enqueuePersistent(db, request));
    assert.equal(sample.result.status, 'queued');
    durations.push(sample.ms);
  }
  return metrics(durations);
}

async function reset(db, requestIdValue) {
  await db.run(`UPDATE garage_queue SET status = 'queued', lease_id = NULL,
    lease_expires_at = NULL, owner_id = NULL, attempts = 0 WHERE request_id = ?`, requestIdValue);
  await db.run("DELETE FROM garage_events WHERE request_id = ? AND event_type IN ('claimed', 'running')", requestIdValue);
}

async function measureClaims(db, counts) {
  const durations = [];
  for (let index = 0; index < counts.warmup + counts.samples; index++) {
    const sample = await timed(() => store.claimNextPersistent(db, { orchestratorId: 'orch' }));
    assert(sample.result?.request_id);
    await reset(db, sample.result.request_id);
    if (index >= counts.warmup) durations.push(sample.ms);
  }
  return metrics(durations);
}

async function measureDrain(db) {
  const input = { db, orchestratorId: 'orch', authorize: async () => {}, reserveSlot: async () => {},
    startMission: async () => ({}), isAlive: async () => true };
  const sample = await timed(() => dispatcher.drainOne(input));
  assert.equal(sample.result?.started, true, JSON.stringify(sample.result));
  await sample.result.completion;
  await reset(db, sample.result.requestId);
  return { count: 1, latencyMs: sample.ms, opsPerSecond: null,
    p50Ms: null, p95Ms: null, p99Ms: null, reason: 'circuit_breaker_limits_identical_drains' };
}

async function removeFixture(directory) {
  const temporaryRoot = path.resolve(os.tmpdir());
  const target = path.resolve(directory);
  assert.equal(path.dirname(target), temporaryRoot);
  assert.match(path.basename(target), /^genos-garage-bench-[A-Za-z0-9]{6}$/);
  const entry = await fs.lstat(target);
  assert(entry.isDirectory() && !entry.isSymbolicLink());
  await fs.rm(target, { recursive: true, force: true });
}

async function runSize(size, counts) {
  const resource = await fixture(size);
  try {
    const enqueue = await enqueueAll(resource.db, size);
    const queued = await resource.db.get("SELECT COUNT(*) AS count FROM garage_queue WHERE status = 'queued'");
    assert.equal(queued.count, size);
    const claim = await measureClaims(resource.db, counts);
    const drain = await measureDrain(resource.db);
    const remaining = await resource.db.get("SELECT COUNT(*) AS count FROM garage_queue WHERE status != 'queued'");
    assert.equal(remaining.count, 0);
    return { jobs: size, enqueue, claim, drain };
  } finally {
    await resource.db.close();
    await removeFixture(resource.directory);
  }
}

function revision() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8' }).trim(); }
  catch { return null; }
}

async function main() {
  const config = options(process.argv.slice(2));
  const result = await runSize(config.size, config);
  process.stdout.write(`${JSON.stringify({ protocol: 'garage-scheduler-v1', revision: revision(),
    environment: { platform: process.platform, arch: process.arch, node: process.version,
      cpu: os.cpus()[0]?.model || null, logicalCpus: os.cpus().length, totalMemoryBytes: os.totalmem(),
      sqlite: 'file/WAL/synchronous=NORMAL' }, config, result }, null, 2)}\n`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
