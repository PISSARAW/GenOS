'use strict';

const assert = require('assert');
const migration = require('../src/services/adapterEcology/multiRepositoryMigrationService');

function repository(repositoryId, dependsOn = []) {
  return { repositoryId, dependsOn, adapterId: `git-${repositoryId}`, baselineRef: `sha:${repositoryId}:before`,
    rollbackAction: 'git.restore-baseline', evidenceRequirements: [`test:${repositoryId}:passed`] };
}

function input() {
  return {
    missionId: 'migration-42', sourceRepositoryId: 'template', pilotRepositoryId: 'api',
    artifactRef: 'artifact:change-set:42', lineageRefs: ['lineage:42'],
    sourceEvidence: [{ kind: 'TEST', ref: 'test:source:passed' }], sourceFitness: 0.9, novelty: 0.4,
    repositories: [repository('api'), repository('web', ['api']),
      repository('worker', ['api']), repository('release', ['web', 'worker'])]
  };
}

function accepted(wave, missingEvidence = false) {
  return { waveIndex: wave.waveIndex, repositoryOutcomes: wave.repositoryIds.map((repositoryId) => ({
    repositoryId, decision: 'ACCEPTED', receiptId: `receipt:${repositoryId}`,
    evidenceRefs: missingEvidence ? [] : [`test:${repositoryId}:passed`]
  })) };
}

function testPilotAndDependencyWaves() {
  const plan = migration.planMigration(input());
  assert.deepStrictEqual(plan.waves.map((wave) => wave.repositoryIds), [
    ['api'], ['web', 'worker'], ['release']
  ]);
  assert.strictEqual(plan.waves[0].propagules[0].selectionPolicy, 'elite');
  assert.strictEqual(plan.waves[1].propagules[0].sourceDemeId, 'api');
  assert.strictEqual(plan.consultative, true);
}

function testEvidenceGateAndCompletion() {
  const plan = migration.planMigration(input());
  const blocked = migration.advanceMigration(plan, accepted(plan.waves[0], true));
  assert.strictEqual(blocked.status, 'BLOCKED_EVIDENCE');
  assert.strictEqual(blocked.currentWave, 0);

  let current = migration.advanceMigration(plan, accepted(plan.waves[0]));
  assert.strictEqual(current.currentWave, 1);
  current = migration.advanceMigration(current, accepted(current.waves[1]));
  current = migration.advanceMigration(current, accepted(current.waves[2]));
  assert.strictEqual(current.status, 'COMPLETED');
  assert.deepStrictEqual(current.completedRepositoryIds, ['api', 'web', 'worker', 'release']);
}

function testRejectionRequiresBoundedRollback() {
  let plan = migration.planMigration(input());
  plan = migration.advanceMigration(plan, accepted(plan.waves[0]));
  const report = accepted(plan.waves[1]);
  report.repositoryOutcomes[1].decision = 'REJECTED';
  const failed = migration.advanceMigration(plan, report);
  assert.strictEqual(failed.status, 'ROLLBACK_REQUIRED');
  assert.deepStrictEqual(failed.rollbackActions.map((item) => item.repositoryId), ['api', 'web']);
  assert.ok(failed.rollbackActions.every((item) => item.action === 'git.restore-baseline'));
}

function testCyclesAreRejected() {
  const cyclic = input();
  cyclic.repositories = [repository('api'), repository('web', ['worker']), repository('worker', ['web'])];
  assert.throws(() => migration.planMigration(cyclic), { code: 'ADAPTER_MIGRATION_DEPENDENCY_CYCLE' });
}

testPilotAndDependencyWaves();
testEvidenceGateAndCompletion();
testRejectionRequiresBoundedRollback();
testCyclesAreRejected();
console.log('Adapter multi-repository migration tests passed.');
