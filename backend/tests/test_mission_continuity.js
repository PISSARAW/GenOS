'use strict';

/**
 * Continuity kernel tests: completion gate, homeostasis history (PK
 * collisions), contract roundtrip, required evidence, pulse emission,
 * allostatic load, immune retry prohibition. Uses an isolated temp database
 * so the assertions never touch a real mission.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const TMP_DB = path.join(os.tmpdir(), `genos_continuity_test_${Date.now()}.db`);
process.env.GENOS_DB_PATH = TMP_DB;
process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'test-only';

const { getDatabase, closeDatabase } = require('../src/db');
const contract = require('../src/services/homeostasisContractService');
const homeostasis = require('../src/services/homeostasisService');
const vitalSignals = require('../src/services/vitalSignalsService');
const immuneMemory = require('../src/services/immuneMemoryService');
const missionOrganism = require('../src/services/missionOrganismService');
const missionContinuity = require('../src/services/missionContinuityService');
const missionIdentity = require('../src/services/missionIdentityService');
const regeneration = require('../src/services/regenerationService');
const { migrateHomeostasisStates } = require('../src/db/migrations/migrateHomeostasisStates');

const TESTS = [];
function test(name, fn) {
  TESTS.push({ name, fn });
}

let db = null;

test('setup', async () => {
  db = await getDatabase(TMP_DB);
});

// 1. Completion gate: agents completed but invariant false ⇒ never completed.
test('completion gate blocks on unsatisfied invariant', async () => {
  const mission = {
    id: 'gate_1',
    completionContract: {
      invariants: [{ kind: 'functional', id: 'f1', verifier: { type: 'context.flag', flag: 'featureWorks' } }],
      requiredEvidence: []
    }
  };
  const organism = missionOrganism.newOrganism({ genome: { objective: 'x' } });
  const withContract = homeostasis.attachHomeostasisToOrganism(organism, mission);
  const gate = await homeostasis.transitionMissionToComplete(db, {
    organism: withContract,
    mission,
    context: { flags: { featureWorks: false } }
  });
  assert.strictEqual(gate.allowed, false, 'gate must block when the invariant is false');
  assert.strictEqual(gate.status, 'unstable');
});

// 2. Completion gate: invariant true + evidence present ⇒ allowed.
test('completion gate allows satisfied contract', async () => {
  const mission = {
    id: 'gate_2',
    completionContract: {
      invariants: [{ kind: 'functional', id: 'f1', verifier: { type: 'context.flag', flag: 'featureWorks' } }],
      requiredEvidence: ['test_suite_passed']
    }
  };
  const organism = missionOrganism.newOrganism({ genome: { objective: 'x' } });
  const withContract = homeostasis.attachHomeostasisToOrganism(organism, mission);
  const gate = await homeostasis.transitionMissionToComplete(db, {
    organism: withContract,
    mission,
    context: { flags: { featureWorks: true }, evidence: ['test_suite_passed'] }
  });
  assert.strictEqual(gate.allowed, true, 'gate must allow a fully satisfied contract');
});

test('generic mission completes when runtime reports success', () => {
  const mission = { id: 'generic_success', objective: 'Propose five ideas' };
  const built = homeostasis.buildMissionHomeostasis(mission);
  const state = contract.evaluateContract(built, { missionOutcome: true });
  assert.strictEqual(state.homeostasisSatisfied, true, 'generic missions need a verifiable success invariant');
});

// 3. Required evidence: invariants true + evidence missing ⇒ blocked.
test('required evidence blocks completion', async () => {
  const mission = {
    id: 'gate_3',
    completionContract: {
      invariants: [{ kind: 'functional', id: 'f1', verifier: { type: 'context.flag', flag: 'ok' } }],
      requiredEvidence: ['security_review', 'test_suite_passed']
    }
  };
  const organism = missionOrganism.newOrganism({ genome: { objective: 'x' } });
  const withContract = homeostasis.attachHomeostasisToOrganism(organism, mission);
  const gate = await homeostasis.transitionMissionToComplete(db, {
    organism: withContract,
    mission,
    context: { flags: { ok: true }, evidence: ['test_suite_passed'] }
  });
  assert.strictEqual(gate.allowed, false);
  assert.strictEqual(gate.status, 'evidence_missing');
  assert.ok(gate.reason.includes('security_review'), 'reason must name the missing evidence');
});

// 4. Homeostasis history: 10 evaluations of one mission without PK collision.
test('homeostasis history accepts repeated evaluations', async () => {
  const mission = { id: 'hist_1', objective: 'test', context: {} };
  for (let i = 0; i < 10; i++) {
    await missionContinuity.evaluateContinuity(db, mission);
  }
  const rows = await db.all("SELECT id FROM homeostasis_states WHERE mission_id = 'hist_1'");
  assert.strictEqual(rows.length, 10, 'each evaluation must persist its own row');
  assert.strictEqual(new Set(rows.map((r) => r.id)).size, 10, 'all state ids must be unique');
});

test('homeostasis migration preserves persisted transitions when rerun', async () => {
  await db.run(
    `INSERT INTO homeostasis_states (id, contract_id, mission_id, status, state_json)
     VALUES (?, ?, ?, ?, ?)`,
    ['migration_preserve_1', 'contract_1', 'migration_preserve', 'unstable', '{}']
  );
  await migrateHomeostasisStates(db);
  const retained = await db.get('SELECT id FROM homeostasis_states WHERE id = ?', 'migration_preserve_1');
  assert.ok(retained, 'rerunning an idempotent migration must not erase transition history');
});

// 5. Contract roundtrip: persisted contract is replayable after restart.
test('contract roundtrip stays replayable', async () => {
  const built = contract.buildHomeostasisContract({
    missionId: 'roundtrip_1',
    invariants: [{ kind: 'functional', id: 'f1', verifier: { type: 'context.flag', flag: 'ok' } }],
    requiredEvidence: ['test_suite_passed']
  });
  const serialized = JSON.parse(JSON.stringify(contract.serializeContract(built)));
  const restored = contract.deserializeContract(serialized);
  const state = contract.evaluateContract(restored, { flags: { ok: true }, evidence: ['test_suite_passed'] });
  assert.strictEqual(state.homeostasisSatisfied, true, 'restored contract must evaluate the same');
});

// 6. Completion contract is the authority, not prompt heuristics.
test('completion contract overrides prompt heuristics', async () => {
  const mission = {
    id: 'authority_1',
    objective: 'Implement pagination for the users endpoint',
    completionContract: {
      invariants: [{ kind: 'functional', id: 'pag', verifier: { type: 'context.flag', flag: 'paginationWorks' } }]
    }
  };
  const built = homeostasis.buildMissionHomeostasis(mission);
  assert.strictEqual(built.invariants.length, 1);
  assert.strictEqual(built.invariants[0].label, 'pag', 'contract invariant must come from the genome, not the prompt');
});

// 7. Allostatic load: no ReferenceError, bounds respected, custom weights.
test('allostatic load is bounded and weight-aware', async () => {
  assert.strictEqual(vitalSignals.allostaticLoad({}), 0);
  assert.strictEqual(
    vitalSignals.allostaticLoad({ failurePressure: 1, contextSaturation: 1, uncertainty: 1, budgetPressure: 1, epistemicDissonance: 1 }),
    1
  );
  const custom = vitalSignals.allostaticLoad({
    failurePressure: 1,
    weights: { failure: 1, context: 0, uncertainty: 0, budget: 0, dissonance: 0 }
  });
  assert.strictEqual(custom, 1, 'a single fully-weighted factor must saturate the load');
  const half = vitalSignals.allostaticLoad({ failurePressure: 0.5 });
  assert.ok(half > 0 && half < 1);
});

// 8. Immune memory: identical crash twice ⇒ exact retry prohibited.
test('immune memory prohibits exact retry after repeated failure', async () => {
  let organism = missionOrganism.newOrganism({ genome: { objective: 'x' } });
  organism = immuneMemory.enrollImmuneMemory(organism, {
    failureCategory: 'crash_after_git',
    strategy: 'A',
    prohibitedExactRetry: true,
    preferredResponse: 'replace_worker'
  });
  const response = immuneMemory.immuneResponse(organism, { failureCategory: 'crash_after_git', strategy: 'A' });
  assert.strictEqual(response.recognized, true, 'signature must be recognized');
  assert.strictEqual(response.response.prohibitExactRetry, true);
  assert.strictEqual(response.response.preferredResponse, 'replace_worker');
  const unknown = immuneMemory.immuneResponse(organism, { failureCategory: 'crash_after_git', strategy: 'B' });
  assert.strictEqual(unknown.recognized, false, 'a different strategy is not prohibited');
});

// 9. Vital pulse emission lands in telemetry ring buffer.
test('vital pulse emission is observable', async () => {
  const before = vitalSignals.buildPulse({ cell: 't1', mission: 'm', state: 'active' });
  const emitted = vitalSignals.emitCellPulse({ cell: 't1', mission: 'm', state: 'active', stress: 0.4 });
  assert.ok(emitted.id, 'emitted pulse has an id');
  assert.ok(before.id, 'built pulse has an id');
  const telemetry = require('../src/services/telemetryObserver');
  const recent = telemetry.ringBuffer.filter((e) => e.eventType === 'CELL_PULSE');
  assert.ok(recent.length > 0, 'CELL_PULSE must reach the telemetry ring buffer');
});

// 10. Cell state interpretation is measurable, not metaphorical.
test('cell state interpretation thresholds', async () => {
  const stalePulse = vitalSignals.buildPulse({ cell: 'c1', mission: 'm', state: 'active', at: new Date(Date.now() - 60000).toISOString() });
  assert.strictEqual(vitalSignals.interpretCellState(stalePulse, 5000, 100), 'unresponsive');
  const starvedPulse = vitalSignals.buildPulse({ cell: 'c2', mission: 'm', state: 'active', tokens: 50 });
  assert.strictEqual(vitalSignals.interpretCellState(starvedPulse, 60000, 100), 'starved');
  const stressedCheck = vitalSignals.buildPulse({ cell: 'c3', mission: 'm', state: 'active', stress: 0.9 });
  assert.strictEqual(vitalSignals.interpretCellState(stressedCheck, 60000, 100), 'stressed');
});

// 11. Empty contract is fail-closed: 0 invariants can never complete.
test('empty contract cannot complete', async () => {
  const mission = { id: 'empty_1', objective: 'nothing declared', context: {} };
  const organism = missionOrganism.newOrganism({ genome: { objective: 'x' } });
  const withContract = homeostasis.attachHomeostasisToOrganism(organism, mission);
  const gate = await homeostasis.transitionMissionToComplete(db, {
    organism: withContract,
    mission,
    context: { flags: {}, evidence: [] }
  });
  assert.strictEqual(gate.allowed, false, 'empty contract must stay blocked (fail-closed)');
});

// 12. Persistence/restart: memory survives, tissues come from live agents.
test('organism memory persists across restart, tissues refresh live', async () => {
  const missionId = 'restart_1';
  await db.run(`INSERT OR IGNORE INTO agents (id, name, role, status, execution_mode, current_task) VALUES (?, 'orch_restart', 'orchestrator', 'idle', 'orchestrator', 'test')`, missionId);
  const mission = { id: missionId, objective: 'restart test', context: {} };
  const first = await missionContinuity.evaluateContinuity(db, mission);
  assert.ok(first.organism, 'first evaluation must assemble an organism');
  await db.run(`INSERT OR IGNORE INTO agents (id, name, role, status, execution_mode, parent_agent_id, current_task) VALUES (?, 'w1', 'worker', 'running', 'worker', ?, 'test')`, `${missionId}_w1`, missionId);
  const second = await missionContinuity.evaluateContinuity(db, mission);
  const liveCells = Array.isArray(second.organism.tissues)
    ? second.organism.tissues
    : Object.values(second.organism.tissues).flatMap((cells) => Array.isArray(cells) ? cells : []);
  const liveIds = liveCells.map((t) => t.identifier);
  assert.ok(liveIds.includes(`${missionId}_w1`), 'tissues must refresh from live agents after restart');
  assert.ok(second.organism.memory, 'memory must survive across evaluations');
});

test('replacement cell is admitted only with explicit evidence and restores required role', () => {
  const organism = { ...missionOrganism.newOrganism({ genome: { objective: 'replacement proof' } }), tissues: { workers: [] } };
  const result = regeneration.regenerateCell({
    organism,
    plan: { kind: 'workers', role: 'verifier', lostIdentifier: 'lost-verifier', replacementId: 'replacement-verifier' },
    mission: 'replacement-mission',
    evidenceRef: 'sha256:replacement-proof'
  });
  assert.equal(result.replacementId, 'replacement-verifier');
  assert.equal(regeneration.verifyFunctionalEquivalence(result.organism, ['verifier']).equivalent, true);
  assert.equal(result.organism.memory.scars.at(-1).evidenceRef, 'sha256:replacement-proof');
});

test('orchestrator succession is single-winner, atomic, and survives database reopen', async () => {
  const missionId = `succession_${Date.now()}`;
  for (const agentId of ['orchestrator_old', 'orchestrator_next_a', 'orchestrator_next_b']) {
    await db.run(`INSERT INTO agents (id, name, role, status, execution_mode) VALUES (?, ?, 'orchestrator', 'idle', 'orchestrator')`, agentId, agentId);
  }
  await missionIdentity.create(db, { missionId, objective: 'durable orchestrator succession', orchestratorAgentId: 'orchestrator_old' });
  const candidates = ['orchestrator_next_a', 'orchestrator_next_b'];
  const outcomes = await Promise.allSettled(candidates.map((agentId) => missionIdentity.attachOrchestrator(db, {
    missionId, agentId, expectedOrchestratorId: 'orchestrator_old'
  })));
  assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1, 'exactly one successor wins');
  assert.equal(outcomes.filter((outcome) => outcome.status === 'rejected').length, 1, 'stale succession contender is rejected');

  const winner = (await missionIdentity.get(db, missionId)).orchestratorAgentId;
  await closeDatabase();
  db = await getDatabase(TMP_DB);
  const restoredMission = await missionIdentity.get(db, missionId);
  assert.equal(restoredMission.orchestratorAgentId, winner, 'mission authority survives process restart');
  const members = await missionIdentity.members(db, missionId);
  assert.ok(members.some((member) => member.id === winner), 'winning successor remains linked to the mission after restart');
  assert.equal(members.filter((member) => member.role === 'orchestrator').length, 2, 'lineage retains prior and current orchestrators');
  await db.run(`INSERT INTO agents (id, name, role, status, execution_mode, parent_agent_id)
    VALUES (?, 'Unrelated', 'worker', 'completed', 'worker', 'orchestrator_old')`, `${missionId}_unrelated`);
  const scoped = await missionIdentity.members(db, missionId);
  assert.equal(scoped.some((member) => member.id === `${missionId}_unrelated`), false,
    'later descendants of a retired orchestrator do not enter this mission');
  const effective = await require('../src/services/regenerationAttemptService').effectiveAgents(db, missionId, scoped);
  assert.equal(effective.some((member) => member.id === 'orchestrator_old'), false,
    'retired orchestrators do not affect the current mission verdict');
});

test('regeneration dispatches a worker once and requires functional proof', async () => {
  const dispatch = require('../src/services/orchestratorDispatchService');
  const garage = require('../src/services/workerGarageService');
  const sandbox = require('../src/services/sandboxExecutor');
  const original = { dispatch: dispatch.dispatchWorkerMission, reserve: garage.reserveSlot,
    idle: garage.enterIdleState, runIsolated: sandbox.runIsolated };
  const missionId = `regeneration_${Date.now()}`;
  await db.run("INSERT INTO workspaces (id, name, path) VALUES (?, 'Regeneration test', ?)", `${missionId}_workspace`, os.tmpdir());
  await db.run("INSERT INTO agents (id, name, role, status, execution_mode, workspace_id) VALUES (?, 'Root', 'orchestrator', 'running', 'orchestrator', ?)", `${missionId}_root`, `${missionId}_workspace`);
  await missionIdentity.create(db, { missionId, objective: 'Repair worker', orchestratorAgentId: `${missionId}_root` });
  await require('../src/services/missionRegenerationChecksService').configure(db, {
    missionId, role: 'verifier', commands: ['npm test'], actor: 'mission_test'
  });
  const organism = missionOrganism.newOrganism({ genome: { objective: 'Repair worker' } });
  let proof = false;
  let dispatches = 0;
  try {
    garage.reserveSlot = async () => ({ slot: 1 });
    garage.enterIdleState = async () => {};
    sandbox.runIsolated = async ({ command }) => ({ command,
      commandHash: `sha256:${crypto.createHash('sha256').update(command).digest('hex')}`,
      executionId: 'independent-check', processId: 123, exitCode: 0,
      timedOut: false, success: true, stdout: '', stderr: '' });
    dispatch.dispatchWorkerMission = async (worker) => {
      dispatches += 1;
      await db.run("UPDATE agents SET status = 'completed' WHERE id = ?", worker.agentId);
      const report = { outcome: 'success', claims: [{ evidence: ['executed check'] }] };
      if (proof) report.functionalEquivalence = {
        lostIdentifier: /lostIdentifier='([^']+)'/.exec(worker.prompt)?.[1], role: 'verifier', passed: true,
        checks: [{ command: 'npm test', exitCode: 0, evidenceRef: 'sha256:check' }]
      };
      await db.run("INSERT INTO telemetry_events (agent_id, event_type, action, payload_json) VALUES (?, 'EVIDENCE_REPORT', 'REPORT', ?)",
        worker.agentId, JSON.stringify({ evidenceReport: report }));
    };
    const makeInput = lostIdentifier => ({ db, missionId, organism, orchestratorAgentId: `${missionId}_root`,
      plan: { lostIdentifier, kind: 'workers', role: 'verifier' }, executionBudget: { tokens: 1000 } });
    const unverified = await regeneration.regenerateWorker(makeInput('lost_one'));
    assert.equal(unverified.success, false);
    assert.equal(unverified.status, 'unverified');
    const duplicate = await regeneration.regenerateWorker(makeInput('lost_one'));
    assert.equal(duplicate.status, 'blocked');
    assert.equal(dispatches, 1);
    proof = true;
    const verified = await regeneration.regenerateWorker(makeInput('lost_two'));
    assert.equal(verified.success, true);
    assert.ok(verified.evidenceRef.startsWith('sha256:'));
    assert.equal(dispatches, 2);
    const attempts = require('../src/services/regenerationAttemptService');
    await attempts.reserve(db, { missionId, lostIdentifier: 'lost_three', role: 'verifier', replacementId: 'worker_recovered' });
    await db.run("UPDATE mission_regeneration_attempts SET owner_pid = -1 WHERE mission_id = ? AND lost_agent_id = 'lost_three'", missionId);
    const recovered = await regeneration.regenerateWorker(makeInput('lost_three'));
    assert.equal(recovered.success, true);
    assert.equal(recovered.replacementId, 'worker_recovered');
    assert.equal(dispatches, 3);
  } finally {
    dispatch.dispatchWorkerMission = original.dispatch;
    garage.reserveSlot = original.reserve;
    garage.enterIdleState = original.idle;
    sandbox.runIsolated = original.runIsolated;
  }
});

test('verified replacement determines the effective mission outcome', async () => {
  const missionId = `effective_${Date.now()}`;
  const rootId = `${missionId}_root`;
  const lostId = `${missionId}_lost`;
  const replacementId = `${missionId}_replacement`;
  await db.run("INSERT INTO agents (id, name, role, status, execution_mode) VALUES (?, 'Root', 'orchestrator', 'completed', 'orchestrator')", rootId);
  await db.run("INSERT INTO agents (id, name, role, status, execution_mode, parent_agent_id) VALUES (?, 'Lost', 'verifier', 'error', 'worker', ?)", lostId, rootId);
  await db.run("INSERT INTO agents (id, name, role, status, execution_mode, parent_agent_id) VALUES (?, 'Replacement', 'verifier', 'idle', 'worker', ?)", replacementId, rootId);
  await missionIdentity.create(db, { missionId, objective: 'Verify replacement', orchestratorAgentId: rootId });
  await missionIdentity.attachAgent(db, { missionId, agentId: lostId, role: 'verifier' });
  await missionIdentity.attachAgent(db, { missionId, agentId: replacementId, role: 'verifier' });
  const attempts = require('../src/services/regenerationAttemptService');
  await attempts.reserve(db, { missionId, lostIdentifier: lostId, replacementId, role: 'verifier' });
  await attempts.mark(db, { missionId, lostIdentifier: lostId, replacementId, status: 'verified', evidenceRef: 'sha256:proof' });
  const result = await missionContinuity.effectiveMissionOutcome(db, missionId);
  assert.equal(result.outcome.success, true);
  assert.equal(result.members.some(agent => agent.id === lostId), true, 'loss remains in historical membership');
});

async function main() {
  let passed = 0;
  let failed = 0;
  for (const entry of TESTS) {
    try {
      await entry.fn();
      passed += 1;
      console.log(`  ok - ${entry.name}`);
    } catch (error) {
      failed += 1;
      console.error(`  FAIL - ${entry.name}`);
      console.error(`    ${error.message}`);
    }
  }
  try { await closeDatabase(); } catch (_) {}
  try { fs.unlinkSync(TMP_DB); } catch (_) {}
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
