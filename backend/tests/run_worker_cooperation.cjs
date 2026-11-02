'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_DB_BACKUP_SKIP = '1';
process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

process.env.GENOS_ADMIN_PASSWORD = randomBytes(24).toString('hex');
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = randomBytes(32).toString('hex');
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = randomBytes(32).toString('hex');

async function qualify() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-worker-cooperation-'));
  process.env.GENOS_DB_PATH = path.join(root, 'qualification.db');
  process.env.GENOS_STUDIO_ROOT = path.join(root, 'studio');
  process.env.GENOS_CAPSULE_ROOT = path.join(root, 'capsules');
  process.env.GENOS_SNAPSHOT_ROOT = path.join(root, 'snapshots');
  process.env.GENOS_WORKSPACES_ROOT = root;
  process.env.GENOS_DISABLE_WORKSPACE_GC = '1';
  const database = require('../src/db');
  const db = await database.getDatabase(process.env.GENOS_DB_PATH);
  const started = performance.now();
  const cpu = process.cpuUsage();
  try {
    const { runScenario } = require('./helpers/workerCooperationScenario.cjs');
    const cases = [];
    for (const scenario of [{ name: 'healthy', healthy: true }, { name: 'repair' },
      { name: 'recovery', corrupt: true }]) cases.push(await runScenario(db, { root, ...scenario }));
    const stages = cases.flatMap(item => item.stages);
    const report = { schema: 'genos.worker-cooperation-qualification/v1',
      scope: 'controlled_native_runtime_integration', cases,
      resources: { workers: stages.length, maxConcurrentWorkers: 1,
        modelTokens: stages.reduce((sum, item) => sum + item.tokens, 0),
        oracleProcesses: stages.reduce((sum, item) => sum + item.oracleCosts.processes, 0),
        elapsedMs: Math.round(performance.now() - started), driverCpuMicros: process.cpuUsage(cpu),
        driverMaxRssKiB: process.resourceUsage().maxRSS },
      limits: { workers: 8, modelTokens: 0, oracleProcesses: 16, elapsedMs: 180000 },
      limitations: ['Explicit scenario decomposition; no autonomous language-model planner.',
        'Measured local fixture incident; no production daemon qualification.',
        'Recovery applies to an isolated capsule; source promotion is not authorized.',
        'Driver CPU/RSS exclude child processes; oracle execution costs are reported separately.'] };
    assert.ok(report.resources.workers <= report.limits.workers);
    assert.equal(report.resources.modelTokens, report.limits.modelTokens);
    assert.ok(report.resources.oracleProcesses <= report.limits.oracleProcesses);
    assert.ok(report.resources.elapsedMs <= report.limits.elapsedMs);
    return report;
  } finally {
    await require('../src/services/garageRuntimeService').stop(db);
    await require('./helpers/flushTelemetrySideEffects').flushTelemetrySideEffects();
    await database.closeDatabase();
    const resolved = path.resolve(root);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('genos-worker-cooperation-'));
    await fs.rm(resolved, { recursive: true, force: true });
  }
}

async function main() {
  const report = await qualify();
  if (process.argv[2]) await fs.writeFile(path.resolve(process.argv[2]), JSON.stringify(report, null, 2));
  process.stdout.write(JSON.stringify({ schema: report.schema, resources: report.resources,
    cases: report.cases.map(item => ({ name: item.name, initialError: item.initialError, finalError: item.finalError,
      kinds: item.stages.map(stage => stage.kind), promoted: item.promoted })) }, null, 2) + '\n');
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { qualify };
