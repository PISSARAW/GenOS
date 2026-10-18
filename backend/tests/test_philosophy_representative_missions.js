'use strict';

const assert = require('node:assert/strict');
const { validateRegistry } = require('../src/philosophy/conceptRegistry');
const { compileRegistry } = require('../src/philosophy/implementationContracts');
const representative = require('../src/philosophy/representativeMissionExperiments');
const router = require('../src/services/philosophyRouter');

const contracts = compileRegistry(validateRegistry().concepts).contracts;
const missions = representative.listRepresentativeMissions();
assert.equal(missions.length, 4);
assert.ok(missions.every((mission) => mission.contractIds.length === 3));

const coverage = representative.runRepresentativeCoverage(contracts);
assert.equal(coverage.missionCount, 4);
assert.equal(coverage.passed, 4);
assert.deepEqual(coverage.failed, []);
assert.equal(coverage.contractExecutions, 48);
assert.equal(coverage.executedRepresentativeMissions, 4);
assert.equal(coverage.validatedOnRealMissions, 0);
assert.equal(coverage.actualTopologyExecution, false);
assert.equal(coverage.independentValidation, false);
assert.equal(coverage.promotionEligible, false);

for (const receipt of coverage.receipts) {
  assert.equal(receipt.passed, true);
  assert.equal(receipt.correctionsApplied, 3);
  assert.equal(receipt.measuredCosts.auditExecutions, 12);
  assert.ok(receipt.measuredCosts.observationBytes > 0);
  assert.ok(receipt.comparisons.every((comparison) => comparison.sameInputs));
  assert.ok(receipt.comparisons.every((comparison) => comparison.controlStateHash !== comparison.treatmentStateHash));
  assert.equal(representative.verifyRepresentativeMission(receipt, contracts), true);
}

const forged = structuredClone(coverage.receipts[0]);
forged.measuredCosts.auditExecutions = 1;
assert.equal(representative.verifyRepresentativeMission(forged, contracts), false);
const promoted = { ...coverage.receipts[0], promotionEligible: true };
assert.equal(representative.verifyRepresentativeMission(promoted, contracts), false);
const changed = contracts.map((contract) => contract.id === forged.contractIds[0]
  ? { ...contract, limits: [...contract.limits, 'changed after receipt'] } : contract);
assert.equal(representative.verifyRepresentativeMission(coverage.receipts[0], changed), false);
assert.throws(() => representative.runRepresentativeMission(contracts, 'unknown'), /Unknown representative/);

async function transport() {
  const listed = await router.handlePhilosophyRequest({ request: {
    operation: 'listRepresentativeMissions', arguments: {},
  } });
  assert.equal(listed.missions.length, 4);
  const receipt = await router.handlePhilosophyRequest({ request: {
    operation: 'runRepresentativeMission', arguments: { missionId: 'causal-attribution' },
  } });
  assert.equal(receipt.passed, true);
  const summary = await router.handlePhilosophyRequest({ request: {
    operation: 'representativeMissionCoverage', arguments: {},
  } });
  assert.equal(summary.passed, 4);
  assert.ok(summary.receipts.every((item) => !item.comparisons));
}

transport().then(() => console.log('Four representative philosophy missions execute, correct and replay under paired budgets.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
