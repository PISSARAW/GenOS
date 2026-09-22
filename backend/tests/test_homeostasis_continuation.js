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
const { maybeDispatchContinuation } = require('../bin/homeostasisContinuationHelper.cjs');

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

test('getImmuneAdvice: returns null when no memory', () => {
  const org = organism.newOrganism({ genome: { objective: 'x' } });
  const advice = continuation.getImmuneAdvice(org, 'missing_work');
  assert.strictEqual(advice, null);
});

test('getImmuneAdvice: returns response when memory exists', () => {
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

test('getImmuneAdvice: prohibits exact retry when enrolled', () => {
  let org = organism.newOrganism({ genome: { objective: 'x' } });
  org = immuneMemory.enrollImmuneMemory(org, {
    failureCategory: 'homeostasis:missing_work',
    strategy: 'homeostasis_continuation',
    prohibitedExactRetry: true,
    preferredResponse: 'replace_worker'
  });
  const advice = continuation.getImmuneAdvice(org, 'missing_work');
  assert.ok(advice);
  assert.strictEqual(advice.prohibitExactRetry, true);
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

test('maybeDispatchContinuation: immune refusal blocks continuation', async () => {
  const db = await getDatabase(TMP_DB);
  await db.run(`INSERT OR IGNORE INTO agents (id, name, role, status, execution_mode, workspace_id, fleet_id, model_tier, language, isolation_mode, current_task) VALUES (?, 'orch_immune', 'orchestrator', 'idle', 'orchestrator', NULL, NULL, 'standard', 'TypeScript', 'Branch', 'test')`, 'orch_immune');
  let org = organism.newOrganism({ genome: { objective: 'x' } });
  org = immuneMemory.enrollImmuneMemory(org, {
    failureCategory: 'homeostasis:missing_work',
    strategy: 'homeostasis_continuation',
    prohibitedExactRetry: true,
    preferredResponse: 'replace_worker'
  });
  const continuity = {};
  const result = await maybeDispatchContinuation({
    db,
    orchestratorId: 'orch_immune',
    task: 'test',
    request: {},
    mission: { id: 'm1', task: 'test task', objective: 'test' },
    completionGate: { allowed: false },
    evaluation: { status: 'evidence_missing', state: {} },
    organism: org,
    finalVerdict: 'homeostasis_blocked',
    continuity
  });
  assert.strictEqual(result.blockedByImmune, true);
  assert.strictEqual(result.dispatched, null);
  assert.ok(continuity.immuneBlocked);
});

test('maybeDispatchContinuation: continuation dispatched when not immune-blocked', async () => {
  const db = await getDatabase(TMP_DB);
  await db.run(`INSERT OR IGNORE INTO agents (id, name, role, status, execution_mode, workspace_id, fleet_id, model_tier, language, isolation_mode, current_task) VALUES (?, 'orch_normal', 'orchestrator', 'idle', 'orchestrator', NULL, NULL, 'standard', 'TypeScript', 'Branch', 'test')`, 'orch_normal');
  const org = organism.newOrganism({ genome: { objective: 'x' } });
  const continuity = {};
  const result = await maybeDispatchContinuation({
    db,
    orchestratorId: 'orch_normal',
    task: 'test',
    request: {},
    mission: { id: 'm2', task: 'test task', objective: 'test' },
    completionGate: { allowed: false },
    evaluation: { status: 'evidence_missing', state: {} },
    organism: org,
    finalVerdict: 'homeostasis_blocked',
    continuity
  });
  assert.strictEqual(result.blockedByImmune, false);
  assert.ok(result.dispatched);
  assert.ok(result.dispatched.targetAgentId);
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
