'use strict';

const assert = require('node:assert/strict');
const fixture = require('./helpers/realWorkerFixture.cjs');
const applier = require('../src/services/topology/topologyResultAppliers/biome.cjs');
const reader = require('../src/services/topology/workerResultReader.cjs');
const biome = require('../src/services/biomeCoordinationService');

function assignments() {
  const procedure = { version: 1, methodId: 'subset_sum', parameters: { values: [2, 3, 7], target: 5 } };
  return Object.fromEntries(['environment_mapper', 'resource_steward', 'population_specialist', 'ecosystem_observer']
    .map(role => [role, role.endsWith('mapper') || role.endsWith('observer')
      ? { workerKind: 'scout_cell', methodContract: { version: 1, methodId: 'scan_literal',
        parameters: { sources: [{ sourceRef: 'mission:input', text: 'Find a subset of [2,3,7] summing to 5.' }], terms: ['subset'] } } }
      : { workerKind: 'specialist', methodContract: { version: 1, methodId: 'niche_procedure',
        parameters: { niche: `biome:${role}`, procedure } } }]));
}

async function main() {
  assert.equal((await applier.apply({ accepted: [] })).applied, false);
  const value = await fixture.fixture({ 'task.txt': 'Find a subset of [2,3,7] summing to 5.' });
  try {
    const result = await fixture.dispatch(value, { processTimeoutMs: 240000, payload: {
      action: 'dispatch_biological', mode: 'biome', variant: 'resource', awaitWorkers: true,
      workerAssignments: assignments(), workerTokenLimit: undefined, timeoutMs: 180000,
      executionBudget: { tokens: 16000, costUsd: 1, latencyMs: 180000 }, execution_budget: undefined
    } });
    assert.equal(result.code, 0, result.stdout + result.stderr);
    const output = JSON.parse(result.stdout.trim().split('\n').at(-1));
    assert.equal(output.success, true, JSON.stringify(output));
    const mode = output.result?.biologicalMode;
    assert.ok(mode, JSON.stringify(output));
    assert.equal(mode.completionContract.verdict, 'succeeded');
    assert.equal(mode.runtimeProgression.applied, true);
    assert.equal(mode.members.length, 4);
    for (const member of mode.members) {
      const saved = await reader.readEvidence(value.db, { missionId: output.missionId, member });
      assert.equal(saved.valid, true);
      assert.equal(saved.receipt.semanticVerification.accepted, true);
      assert.equal(saved.receipt.budgetAssessment.satisfied, true);
      assert.ok(saved.binding.budget.latencyMs > 0);
      assert.equal(saved.binding.budget.costUsd, 0.25);
    }
    const snapshot = await biome.sessionSnapshot(mode.sessionId, { db: value.db });
    assert.equal(snapshot.status, 'completed');
    assert.equal(snapshot.ecologicalState.runtime.goalVerification.verified, true);
    assert.equal(snapshot.populations.flatMap(p => p.individuals).length, 4);
    const blocked = await applier.apply({ db: value.db, context: { missionId: output.missionId },
      topology: { sessionId: mode.sessionId }, composition: { members: mode.members },
      accepted: mode.members.map(member => ({ ...member, executionRunId: 'foreign-run' })) });
    assert.equal(blocked.applied, false);
    console.log('Biome CLI dispatch: four real native runtimes, budgets, independent oracles and persisted ecological closure passed.');
  } finally { await fixture.close(value); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
