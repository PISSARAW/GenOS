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

test('classifyDeviation: unsafe takes priority over failed invariants', () => {
  const d = continuation.classifyDeviation({
    status: 'unsafe',
    state: { failedInvariants: [{ id: 'safety_x' }] }
  });
  assert.strictEqual(d, 'unsafe_action', 'unsafe status must produce unsafe_action, not failed_proof');
});

test('empty contract cannot complete', async () => {
  const db = await getDatabase(TMP_DB);
  const { evaluateContract } = require('../src/services/homeostasisContractService');
  const state = evaluateContract({ invariants: [], requiredEvidence: [] }, { flags: {} });
  assert.strictEqual(state.homeostasisSatisfied, false, '0 invariants must not satisfy homeostasis');
  assert.strictEqual(state.ratio, 0, 'ratio must be 0 when no invariants exist');
});

test('continuation budget is enforced', async () => {
  const db = await getDatabase(TMP_DB);
  await db.run(`INSERT OR IGNORE INTO agents (id, name, role, status, execution_mode, workspace_id, fleet_id, model_tier, language, isolation_mode, current_task) VALUES (?, 'orch_budget', 'orchestrator', 'idle', 'orchestrator', NULL, NULL, 'standard', 'TypeScript', 'Branch', 'test')`, 'orch_budget');
  const org = organism.newOrganism({ genome: { objective: 'x' } });
  const evalInput = { status: 'evidence_missing', state: { evidence: { satisfied: false, missing: ['test_suite_passed'] } } };
  let lastResult;
  // Simulate successive rounds: each worker terminates (row completed) then
  // homeostasis is re-evaluated still blocked, so the next round is a new
  // decision, until the budget is exhausted.
  for (let i = 0; i < 5; i++) {
    lastResult = await continuation.dispatchHomeostasisContinuation({
      db,
      orchestratorId: 'orch_budget',
      mission: { id: 'm_budget', task: 'test task', objective: 'test' },
      organismState: org,
      evaluation: evalInput
    });
    if (lastResult.targetAgentId) {
      await db.run(`UPDATE continuation_queue SET status = 'completed' WHERE id = ?`, lastResult.decisionId).catch(() => {});
    }
  }
  assert.ok(lastResult.exhausted, 'after exceeding MAX_HOMEOSTASIS_CONTINUATIONS, dispatch must report exhausted');
  assert.strictEqual(lastResult.targetAgentId, null, 'exhausted dispatch must not create an agent');
});

test('continuation idempotency: same blocked fingerprint dispatches once', async () => {
  const db = await getDatabase(TMP_DB);
  await db.run(`INSERT OR IGNORE INTO agents (id, name, role, status, execution_mode, workspace_id, fleet_id, model_tier, language, isolation_mode, current_task) VALUES (?, 'orch_idem', 'orchestrator', 'idle', 'orchestrator', NULL, NULL, 'standard', 'TypeScript', 'Branch', 'test')`, 'orch_idem');
  const org = organism.newOrganism({ genome: { objective: 'x' } });
  const evalInput = { status: 'evidence_missing', state: { evidence: { satisfied: false, missing: ['test_suite_passed'] } } };
  const result1 = await continuation.dispatchHomeostasisContinuation({
    db,
    orchestratorId: 'orch_idem',
    mission: { id: 'm_idem', task: 'test task', objective: 'test' },
    organismState: org,
    evaluation: evalInput
  });
  assert.ok(result1.targetAgentId, 'first dispatch must create agent');
  const result2 = await continuation.dispatchHomeostasisContinuation({
    db,
    orchestratorId: 'orch_idem',
    mission: { id: 'm_idem', task: 'test task', objective: 'test' },
    organismState: org,
    evaluation: evalInput
  });
  assert.ok(result2.idempotent, 'second dispatch with same blocked fingerprint must be idempotent');
  // Only one active continuation_queue record for this (mission, deviation)
  const rows = await db.all(`SELECT id FROM continuation_queue WHERE json_extract(mission_json, '$.homeostasisMissionId') = 'm_idem'`);
  assert.strictEqual(rows.length, 1, 'idempotent dispatch must not create a duplicate continuation record');
});

test('unsafe deviation is quarantined without spawning a worker', async () => {
  const db = await getDatabase(TMP_DB);
  await db.run(`INSERT OR IGNORE INTO agents (id, name, role, status, execution_mode, current_task) VALUES (?, 'orch_unsafe', 'orchestrator', 'idle', 'orchestrator', 'test')`, 'orch_unsafe');
  const org = organism.newOrganism({ genome: { objective: 'x' } });
  const before = await db.all("SELECT id FROM agents WHERE id LIKE 'worker_homeostasis_%'");
  const result = await continuation.dispatchHomeostasisContinuation({
    db,
    orchestratorId: 'orch_unsafe',
    mission: { id: 'm_unsafe', task: 'test task', objective: 'test' },
    organismState: org,
    evaluation: { status: 'unsafe', state: { failedInvariants: [{ id: 'safety_x', label: 'safety_x' }] } }
  });
  assert.strictEqual(result.quarantined, true, 'unsafe must quarantine');
  assert.strictEqual(result.targetAgentId, null, 'unsafe must not spawn a worker');
  const after = await db.all("SELECT id FROM agents WHERE id LIKE 'worker_homeostasis_%'");
  assert.strictEqual(after.length, before.length, 'no new worker agent may be inserted for unsafe');
});

test('maybeDispatchContinuation quarantines unsafe without dispatch', async () => {
  const db = await getDatabase(TMP_DB);
  await db.run(`INSERT OR IGNORE INTO agents (id, name, role, status, execution_mode, current_task) VALUES (?, 'orch_unsafe2', 'orchestrator', 'idle', 'orchestrator', 'test')`, 'orch_unsafe2');
  const org = organism.newOrganism({ genome: { objective: 'x' } });
  const continuity = {};
  const result = await maybeDispatchContinuation({
    db,
    orchestratorId: 'orch_unsafe2',
    task: 'test',
    request: {},
    mission: { id: 'm_unsafe2', task: 'test task', objective: 'test' },
    completionGate: { allowed: false },
    evaluation: { status: 'unsafe', state: { failedInvariants: [{ id: 'safety_x' }] } },
    organism: org,
    finalVerdict: 'homeostasis_blocked',
    continuity
  });
  assert.strictEqual(result.quarantined, true);
  assert.strictEqual(result.dispatched, null);
  assert.strictEqual(result.finalVerdict, 'homeostasis_quarantined');
});

test('isImmuneBlocked rejects continuation when category is prohibited', () => {
  let org = organism.newOrganism({ genome: { objective: 'x' } });
  org = immuneMemory.enrollImmuneMemory(org, {
    failureCategory: 'homeostasis:missing_work',
    strategy: 'homeostasis_continuation',
    prohibitedExactRetry: true
  });
  const blocked = continuation.isImmuneBlocked(org, 'missing_work', 'homeostasis_continuation');
  assert.strictEqual(blocked, true, 'isImmuneBlocked must return true when immune memory prohibits');
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
