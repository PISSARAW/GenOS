'use strict';

const assert = require('node:assert/strict');
const { composeReplacementCohort } = require('../src/services/morphogenesis/replacementCohortComposer');

const base = {
  missionId: 'mission-plasticity', parentId: 'orchestrator-1', epoch: 4,
  topology: 'holobionte', variant: 'causal_microgroup', executionPath: 'morphogenesis',
  quiescence: { confirmed: true }, mission: { prompt: 'Investigate the current failure.', writeLease: true },
  currentCohort: [{ id: 'old-scout', status: 'completed', workerKind: 'scout_cell' }],
  remainingBudget: { tokens: 7000 },
  parentAuthority: { allowedTools: ['genos_search_failures', 'genos_worker_publish'],
    read: true, analyze: true, execute: true, write: false, promote: false },
  blueprint: { assignments: [{ role: 'independent_reviewer', workerKind: 'red_worker',
    capabilities: ['adversarial_review'], tools: ['genos_search_failures'], tokenBudget: 2600,
    methodContract: { version: 1, methodId: 'prompt_defined' } }] }
};

const first = composeReplacementCohort(base);
const second = composeReplacementCohort(base);
assert.equal(first.workers.length, 1);
assert.notEqual(first.workers[0].id, base.currentCohort[0].id, 'epoch recruits a new worker identity');
assert.equal(first.workers[0].workerKind, 'red_worker', 'new cohort can change worker family');
assert.equal(first.workers[0].workerContract.identity.workerKind, 'red_worker');
assert.deepEqual(first.workers[0].toolLease, ['genos_search_failures'], 'lease is intersected with the orchestrator ceiling and assignment request');
assert.equal(first.workers[0].workerContract.authority.write, false);
assert.equal(first.workers[0].workerContract.authority.promote, false);
assert.equal(first.workers[0].workerContract.authority.spawn, false);
assert.equal(first.budget.allocatedTokens, 2600);
assert.deepEqual(first.retireWorkerIds, ['old-scout']);
assert.equal(first.workers[0].id, second.workers[0].id, 'retrying the same epoch is deterministic');

assert.throws(() => composeReplacementCohort({ ...base, quiescence: { confirmed: false } }),
  { code: 'MORPHOGENESIS_QUIESCENCE_REQUIRED' });
assert.throws(() => composeReplacementCohort({ ...base, topology: 'trinity' }),
  { code: 'TRINITY_USES_SEALED_PATH' });
assert.throws(() => composeReplacementCohort({ ...base,
  currentCohort: [{ id: 'busy', status: 'running', runtime: { calls: 1 } }] }),
{ code: 'MORPHOGENESIS_COHORT_NOT_QUIESCENT' });
assert.equal(base.currentCohort[0].status, 'completed', 'composition does not mutate the existing cohort');
assert.throws(() => composeReplacementCohort({ ...base, remainingBudget: { tokens: 2000 } }),
  { code: 'MORPHOGENESIS_COHORT_BUDGET_EXCEEDED' });
const noPrivilege = composeReplacementCohort({ ...base,
  parentAuthority: { ...base.parentAuthority, allowedTools: [] },
  blueprint: { assignments: [{ ...base.blueprint.assignments[0], tools: ['genos_adversarial_review'] }] } });
assert.deepEqual(noPrivilege.workers[0].toolLease, [], 'a new worker cannot gain tools outside the parent lease');
const biomeMapper = composeReplacementCohort({ ...base, topology: 'biome',
  mission: { prompt: 'Repartis item1=1, item2=3, item3=2 en 3 groupes; aucun groupe ne doit depasser un total de 8.' },
  blueprint: { assignments: [{ role: 'environment_mapper', workerKind: 'scout_cell',
    capabilities: ['observe'], tokenBudget: 2600,
    methodContract: { version: 1, methodId: 'prompt_defined', source: 'mission_prompt', requiredCapabilities: [] } }] }
});
assert.equal(biomeMapper.workers[0].methodContract.methodId, 'scan_literal');
assert.equal(biomeMapper.workers[0].workerContract.mission.methodContract.methodId, 'scan_literal',
  'the replacement cohort seals the adapted native method into its worker contract');

console.log('Morphogenesis replacement cohorts: new identities, worker kinds, bounded lease/authority/budget, quiescence and Trinity gates PASS');
