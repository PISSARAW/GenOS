'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TMP_DB = path.join(os.tmpdir(), `genos_homeo_cont_${Date.now()}.db`);
process.env.GENOS_DB_PATH = TMP_DB;
process.env.GENOS_ADMIN_PASSWORD = 'test-only';

const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
const runtimeAdapterPath = require.resolve('../src/services/agentRuntimeAdapter');
require.cache[runtimeAdapterPath] = {
  id: runtimeAdapterPath,
  filename: runtimeAdapterPath,
  loaded: true,
  exports: {
    startMission: async (mission) => {
      if (!mission || !mission.agentId) throw new Error('invalid mission');
      return { started: true, mock: true };
    }
  }
};

const { getDatabase, closeDatabase } = require('../src/db');
const continuation = require('../src/services/homeostasisContinuationService');
const immuneMemory = require('../src/services/immuneMemoryService');
const organism = require('../src/services/missionOrganismService');

const TESTS = [];
function test(name, fn) { TESTS.push({ name, fn }); }

test('classifyDeviation: missing_work', () => {
  const d = continuation.classifyDeviation({ status: 'evidence_missing', state: {} });
  assert.strictEqual(d, 'missing_work');
});

test('classifyDeviation: failed_proof', () => {
  const d = continuation.classifyDeviation({ status: 'unstable', state: { failedInvariants: [{ id: 'f1' }] } });
  assert.strictEqual(d, 'failed_proof');
});

test('classifyDeviation: unsafe_action', () => {
  const d = continuation.classifyDeviation({ status: 'unsafe', state: {} });
  assert.strictEqual(d, 'unsafe_action');
});

test('classifyDeviation: incomplete fallback', () => {
  const d = continuation.classifyDeviation({ status: 'unknown', state: {} });
  assert.strictEqual(d, 'incomplete');
});

test('immuneAdvice: returns null when no memory', () => {
  const org = organism.newOrganism({ genome: { objective: 'x' } });
  const advice = continuation.getImmuneAdvice(org, 'missing_work');
  assert.strictEqual(advice, null);
});

test('immuneAdvice: returns response when memory exists', () => {
  let org = organism.newOrganism({ genome: { objective: 'x' } });
  org = immuneMemory.enrollImmuneMemory(org, {
    failureCategory: 'homeostasis:missing_work',
    strategy: 'homeostasis_continuation',
    preferredResponse: 'replace_worker'
  });
  const advice = continuation.getImmuneAdvice(org, 'missing_work');
  assert.ok(advice);
  assert.strictEqual(advice.preferredResponse, 'replace_worker');
});

test('buildPrompt: includes deviation and failed invariants', () => {
  const prompt = continuation.buildPrompt(
    { task: 'Fix auth' },
    'failed_proof',
    { state: { failedInvariants: [{ id: 'f1', label: 'auth_works' }] } }
  );
  assert.ok(prompt.includes('failed_proof'));
  assert.ok(prompt.includes('auth_works'));
});

test('dispatchHomeostasisContinuation inserts agent and starts mission', async () => {
  const db = await getDatabase(TMP_DB);
  await db.run(`INSERT OR IGNORE INTO agents (id, name, role, status, execution_mode, current_task) VALUES (?, 'test_orchestrator', 'orchestrator', 'idle', 'orchestrator', 'test')`, 'orch_1');
  const org = organism.newOrganism({ genome: { objective: 'x' } });
  const result = await continuation.dispatchHomeostasisContinuation({
    db,
    orchestratorId: 'orch_1',
    mission: { id: 'm1', task: 'test task', objective: 'test' },
    organismState: org,
    evaluation: { status: 'evidence_missing', state: { evidence: { satisfied: false } } }
  });
  const agents = await db.all("SELECT id FROM agents WHERE id LIKE 'worker_homeostasis_%'");
  assert.ok(agents.length > 0, 'homeostasis continuation agent must be inserted');
  assert.ok(result.targetAgentId, 'result must include targetAgentId');
  assert.strictEqual(result.deviation, 'missing_work');
});

async function main() {
  let passed = 0, failed = 0;
  for (const entry of TESTS) {
    try { await entry.fn(); passed++; console.log(`  ok - ${entry.name}`); }
    catch (error) { failed++; console.error(`  FAIL - ${entry.name}\n    ${error.stack || error.message}`); }
  }
  try { await closeDatabase(); } catch (_) {}
  try { fs.unlinkSync(TMP_DB); } catch (_) {}
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
main();
