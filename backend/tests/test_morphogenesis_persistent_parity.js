'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const GRAPH = {
  nodes: [{ nodeId: 'root', kind: 'TOPOLOGY', topology: 'rhizome', variant: null,
    parentNodeId: null, budget: { tokens: 120, growth: 1 }, lifecycle: 'active' }],
  edges: [], rootNodeId: 'root', graphId: 'persistent-parity-graph', missionId: 'persistent-parity-mission',
  globalBudget: { tokens: 120, growth: 1 }
};
const INPUT = { problemSpace: ['p1', 'p2'], requirements: ['r1'], work_packages: ['w1'], document: { v: 1 }, operations: [], measurements: { productivity: 1 } };

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().filter((key) => !DYNAMIC_FIELDS.has(key))
    .map((key) => [key, stable(value[key])]));
}

const DYNAMIC_FIELDS = new Set(['executionId', 'parentExecutionId', 'receiptId', 'startedAt', 'completedAt', 'timestamp']);

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function childCode() {
  return `const { getDatabase, closeDatabase } = require('./src/db');
const { MorphologyRuntime } = require('./src/services/morphogenesis/runtime/morphologyRuntime');
const { compileExpression } = require('./src/services/morphogenesis/graph/morphologyCompiler');
const { topologyExpression } = require('./src/services/morphogenesis/expression');
const crypto = require('node:crypto');
const graph = ${JSON.stringify(GRAPH)};
const input = ${JSON.stringify(INPUT)};
const fields = new Set(['executionId','parentExecutionId','receiptId','startedAt','completedAt','timestamp']);
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (!value || typeof value !== 'object') return value; return Object.fromEntries(Object.keys(value).sort().filter((key) => !fields.has(key)).map((key) => [key, stable(value[key])])); }
(async () => {
  const db = await getDatabase(process.env.GENOS_DB_PATH);
  await db.exec('CREATE TABLE IF NOT EXISTS morphogenesis_persistent_parity (mission_id TEXT PRIMARY KEY, output_digest TEXT NOT NULL, owner TEXT NOT NULL)');
  const runtime = new MorphologyRuntime({ globalBudget: { tokens: 120 } });
  const compiled = compileExpression(topologyExpression('rhizome', null, { mission: graph.missionId }), { mission: graph.missionId, globalBudget: graph.globalBudget });
  const result = await runtime.execute(compiled, input);
  const outputDigest = crypto.createHash('sha256').update(JSON.stringify(stable(result.output))).digest('hex');
  await db.run('INSERT OR IGNORE INTO morphogenesis_persistent_parity (mission_id, output_digest, owner) VALUES (?, ?, ?)', [graph.missionId, outputDigest, process.argv[1]]);
  const row = await db.get('SELECT output_digest, owner FROM morphogenesis_persistent_parity WHERE mission_id = ?', [graph.missionId]);
  console.log(JSON.stringify({ outputDigest, persistedDigest: row?.output_digest, persistedOwner: row?.owner }));
  await closeDatabase();
})().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });`;
}

function runChild(databasePath, owner) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', childCode(), owner], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, GENOS_DB_PATH: databasePath, GENOS_ADMIN_PASSWORD: 'morphogenesis-parity-only',
        GENOS_SQLITE_BUSY_TIMEOUT_MS: '30000' },
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
    });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`persistent parity child failed (${owner}): ${stderr || stdout}`));
      try { resolve(JSON.parse(stdout.trim().split(/\r?\n/).pop())); }
      catch (error) { reject(new Error(`persistent parity child returned invalid JSON: ${stdout}`, { cause: error })); }
    });
  });
}

async function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-morphogenesis-parity-'));
  const databasePath = path.join(root, 'runtime.db');
  try {
    const first = await runChild(databasePath, 'worker-a');
    const [second, third] = await Promise.all([runChild(databasePath, 'worker-b'), runChild(databasePath, 'worker-c')]);
    assert.equal(second.outputDigest, first.outputDigest, 'a restarted process must produce the same normalized morphology output');
    assert.equal(third.outputDigest, first.outputDigest, 'concurrent process must produce the same normalized morphology output');
    assert.equal(second.persistedDigest, first.outputDigest, 'the restarted process must read the persisted receipt');
    assert.equal(third.persistedDigest, first.outputDigest, 'the concurrent process must read the persisted receipt');
    console.log('Morphogenesis persistent multi-process parity: PASS');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

if (require.main === module) run().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });

module.exports = { digest, run };
