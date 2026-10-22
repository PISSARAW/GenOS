'use strict';

// This campaign extends the persistent parity proof across every controller
// topology and two composed deployment shapes. It still proves the SQLite
// process boundary only; real network schedulers require an integration run.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SCENARIOS = [
  'trinity', 'a_team', 'rhizome', 'syncytium', 'biocenose',
  'parallel-trinity-rhizome', 'nest-ateam-syncytium'
];
const INPUT = {
  problemSpace: ['p1', 'p2'], requirements: ['r1'], work_packages: ['w1'],
  document: { v: 1 }, operations: [], measurements: { productivity: 1 }
};
const DYNAMIC_FIELDS = new Set([
  'executionId', 'parentExecutionId', 'receiptId', 'startedAt', 'completedAt',
  'timestamp', 'expressionId'
]);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort()
    .filter((key) => !DYNAMIC_FIELDS.has(key))
    .map((key) => [key, stable(value[key])]));
}

function childCode() {
  return `const crypto = require('node:crypto');
const { getDatabase, closeDatabase } = require('./src/db');
const { MorphologyRuntime } = require('./src/services/morphogenesis/runtime/morphologyRuntime');
const { compileExpression } = require('./src/services/morphogenesis/graph/morphologyCompiler');
const expression = require('./src/services/morphogenesis/expression');
const scenario = process.env.GENOS_PARITY_SCENARIO;
const mission = 'distributed-parity:' + scenario;
const input = ${JSON.stringify(INPUT)};
const fields = new Set(${JSON.stringify([...DYNAMIC_FIELDS])});
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().filter((key) => !fields.has(key))
    .map((key) => [key, stable(value[key])]));
}
function expressionFor(name) {
  const topology = (id) => expression.topologyExpression(id, null, { mission });
  if (name === 'parallel-trinity-rhizome') return expression.parallelExpression(
    [topology('trinity'), topology('rhizome')], { mission });
  if (name === 'nest-ateam-syncytium') return expression.nestExpression(
    topology('a_team'), topology('syncytium'), { mission });
  return topology(name);
}
(async () => {
  const db = await getDatabase(process.env.GENOS_DB_PATH);
  await db.exec('CREATE TABLE IF NOT EXISTS morphogenesis_distributed_parity (mission_id TEXT PRIMARY KEY, scenario TEXT NOT NULL, output_digest TEXT NOT NULL, owner TEXT NOT NULL)');
  const graph = compileExpression(expressionFor(scenario), { mission, globalBudget: { tokens: 120, growth: 1 } });
  const result = await new MorphologyRuntime({ globalBudget: { tokens: 120 } }).execute(graph, input);
  const outputDigest = crypto.createHash('sha256').update(JSON.stringify(stable(result.output))).digest('hex');
  await db.run('INSERT OR IGNORE INTO morphogenesis_distributed_parity (mission_id, scenario, output_digest, owner) VALUES (?, ?, ?, ?)', [mission, scenario, outputDigest, process.argv[1]]);
  const row = await db.get('SELECT output_digest, scenario FROM morphogenesis_distributed_parity WHERE mission_id = ?', [mission]);
  console.log(JSON.stringify({ scenario, outputDigest, persistedDigest: row?.output_digest, persistedScenario: row?.scenario }));
  await closeDatabase();
})().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });`;
}

function runChild(databasePath, scenario, owner) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', childCode(), owner], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, GENOS_DB_PATH: databasePath, GENOS_PARITY_SCENARIO: scenario,
        GENOS_ADMIN_PASSWORD: 'morphogenesis-distributed-parity-only', GENOS_SQLITE_BUSY_TIMEOUT_MS: '30000' },
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
    });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`distributed parity child failed (${scenario}/${owner}): ${stderr || stdout}`));
      try { resolve(JSON.parse(stdout.trim().split(/\r?\n/).pop())); }
      catch (error) { reject(new Error(`distributed parity child returned invalid JSON: ${stdout}`, { cause: error })); }
    });
  });
}

async function runScenario(databasePath, scenario) {
  const first = await runChild(databasePath, scenario, 'worker-a');
  const [second, third] = await Promise.all([
    runChild(databasePath, scenario, 'worker-b'), runChild(databasePath, scenario, 'worker-c')
  ]);
  for (const result of [second, third]) {
    assert.equal(result.outputDigest, first.outputDigest, `${scenario}: process output must remain stable`);
    assert.equal(result.persistedDigest, first.outputDigest, `${scenario}: process must read persisted digest`);
    assert.equal(result.persistedScenario, scenario, `${scenario}: persisted scenario must be scoped`);
  }
}

function deferRootCleanup(root) {
  const cleanup = `const fs = require('node:fs');
setTimeout(() => {
  fs.rmSync(process.argv[1], { recursive: true, force: true, maxRetries: 150, retryDelay: 200 });
}, 250);`;
  const cleaner = spawn(process.execPath, ['-e', cleanup, root], {
    detached: true, stdio: 'ignore', windowsHide: true
  });
  cleaner.unref();
}

function removeTemporaryRoot(root) {
  try { fs.rmSync(root, { recursive: true, force: true, maxRetries: 30, retryDelay: 200 }); }
  catch (error) {
    if (!fs.existsSync(root)) return;
    if (!['EBUSY', 'ENOTEMPTY', 'EPERM'].includes(error?.code)) throw error;
    deferRootCleanup(root);
  }
}

async function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-morphogenesis-distributed-parity-'));
  const databasePath = path.join(root, 'runtime.db');
  try {
    for (const scenario of SCENARIOS) await runScenario(databasePath, scenario);
    console.log(`Morphogenesis distributed topology parity (${SCENARIOS.length} scenarios): PASS`);
  } finally {
    removeTemporaryRoot(root);
  }
}

if (require.main === module) run().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });

module.exports = { SCENARIOS, stable, run };
