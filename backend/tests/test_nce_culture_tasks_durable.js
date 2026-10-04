'use strict';

const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const bridge = require('../src/services/culturalPhenotypeBridgeService');
const phenotype = require('../src/services/phenotypicDevelopmentService');
const vectors = require('../src/services/phenotypeVectorService');
const execFileAsync = promisify(execFile);

const repoRoot = path.resolve(__dirname, '../..');
const taskChecks = [
  { id: 'nce-workflow-e2e', file: 'backend/tests/test_nce_workflows_e2e.js' },
  { id: 'cultural-transfer-causality', file: 'backend/tests/test_cultural_phenotype_causality.js' },
  { id: 'phenotype-persistence-roundtrip', file: 'backend/tests/test_nce_phenotype_persistence.js' },
];

async function runTask(task) {
  const source = await fs.readFile(path.join(repoRoot, task.file), 'utf8');
  const started = Date.now();
  try {
    const result = await execFileAsync(process.execPath, [task.file], {
      cwd: repoRoot, timeout: 60000, maxBuffer: 1024 * 1024, windowsHide: true,
    });
    const evidence = `${result.stdout || ''}\n${result.stderr || ''}`;
    return {
      taskId: task.id, passed: true, exitCode: 0, durationMs: Date.now() - started,
      sourceDigest: crypto.createHash('sha256').update(source).digest('hex'),
      evidenceDigest: crypto.createHash('sha256').update(evidence).digest('hex'),
      summary: String(result.stdout || '').trim().split(/\r?\n/).slice(-2).join(' '),
    };
  } catch (error) {
    const evidence = `${error.stdout || ''}\n${error.stderr || ''}`;
    return {
      taskId: task.id, passed: false,
      exitCode: Number.isInteger(error.code) ? error.code : (error.status ?? null),
      durationMs: Date.now() - started,
      sourceDigest: crypto.createHash('sha256').update(source).digest('hex'),
      evidenceDigest: crypto.createHash('sha256').update(evidence).digest('hex'),
      summary: String(error.stderr || error.message).trim().split(/\r?\n/).slice(-2).join(' '),
    };
  }
}

async function scoreTaskSuite(state) {
  if (!state.branches.some((branch) => branch.capabilities.includes('nce-workflow-validation'))) {
    return { score: 0, outcomes: [] };
  }
  const outcomes = [];
  for (const task of taskChecks) outcomes.push(await runTask(task));
  return { score: outcomes.filter((outcome) => outcome.passed).length / outcomes.length, outcomes };
}

async function main() {
  const dbPath = path.join(os.tmpdir(), `genos-nce-durable-${process.pid}-${Date.now()}.db`);
  let db = await open({ filename: dbPath, driver: sqlite3.Database });
  try {
    await db.run(`CREATE TABLE agent_phenotype_states (
      id TEXT PRIMARY KEY, agent_id TEXT, genome_id TEXT, state_json TEXT,
      phenotype_json TEXT, branches_json TEXT, atrophies_json TEXT, history_json TEXT,
      created_at TEXT, updated_at TEXT
    )`);
    const state = {
      id: 'pheno_agent-nce-durable', agentId: 'agent-nce-durable', genomeId: 'genome-nce-durable',
      currentPhenotype: { role: 'repository-maintainer' }, branches: [], atrophies: [], history: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const before = await scoreTaskSuite(state);
    let measuredAfter;
    const transfer = await bridge.transferCultureToPhenotype({
      phenotypeState: state,
      artifact: { ...require('../src/services/culturalTransmissionService').createCulturalArtifact({
        agentId: 'teacher', type: 'procedure',
        content: { requiredCapabilities: ['nce-workflow-validation'] },
      }), id: 'artifact-nce-workflow-validation' },
      benchmark: async () => {
        measuredAfter = await scoreTaskSuite(state);
        return measuredAfter.score;
      },
    });
    const after = measuredAfter;
    assert.equal(before.score, 0);
    assert.equal(transfer.transfer.before, 0);
    assert.equal(transfer.transfer.after, 1, 'all three executable workflow tasks pass after transfer');
    assert.equal(transfer.transfer.delta, 1, 'the transmitted phenotype adds a full task-suite point');
    assert.equal(after.score, 1);
    assert.equal(after.outcomes.length, taskChecks.length);
    assert.ok(after.outcomes.every((outcome) => outcome.passed && outcome.sourceDigest && outcome.evidenceDigest));
    await phenotype.savePhenotypeState(state, db);
    const beforeVector = transfer.phenotype.beforeVector;
    const afterVector = transfer.phenotype.afterVector;
    assert.ok(vectors.cosineSimilarity(beforeVector, afterVector) < 1);
    await db.close();

    db = await open({ filename: dbPath, driver: sqlite3.Database });
    const restored = await phenotype.loadPhenotypeState(state.genomeId, db, state.agentId);
    const restoredTasks = await scoreTaskSuite(restored);
    assert.equal(restoredTasks.score, 1, 'all NCE workflow tasks pass again after SQLite restart');
    assert.deepEqual(vectors.phenotypeVector(restored.currentPhenotype, restored), afterVector);
    console.log(JSON.stringify({
      benchmark: 'nce-cultural-workflow-tasks/v2',
      tasks: after.outcomes,
      before: 0,
      after: after.score,
      afterRestart: restoredTasks.score,
      phenotypeVector: afterVector,
    }));
  } finally {
    if (db) await db.close();
    await fs.rm(dbPath, { force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
