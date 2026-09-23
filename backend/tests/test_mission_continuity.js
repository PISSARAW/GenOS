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
  const liveIds = second.organism.tissues.map((t) => t.identifier);
  assert.ok(liveIds.includes(`${missionId}_w1`), 'tissues must refresh from live agents after restart');
  assert.ok(second.organism.memory, 'memory must survive across evaluations');
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