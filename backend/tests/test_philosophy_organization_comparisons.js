'use strict';

const assert = require('node:assert/strict');
const { validateRegistry } = require('../src/philosophy/conceptRegistry');
const { compileRegistry } = require('../src/philosophy/implementationContracts');
const experiments = require('../src/philosophy/organizationMissionExperiments');
const router = require('../src/services/philosophyRouter');

const contracts = compileRegistry(validateRegistry().concepts).contracts;
const coverage = experiments.runOrganizationCoverage(contracts);
assert.equal(coverage.missionCount, 4);
assert.equal(coverage.organizationRuns, 16);
assert.equal(coverage.passed, 4);
assert.deepEqual(coverage.failed, []);
assert.equal(coverage.actualOrganizationExecution, true);
assert.equal(coverage.actualTopologyExecution, false);
assert.equal(coverage.independentValidation, false);

for (const receipt of coverage.receipts) {
  assert.equal(receipt.budgetParity, true);
  assert.equal(receipt.outcomeParity, true);
  assert.equal(receipt.organizations.length, 4);
  assert.ok(receipt.organizations.every((item) => item.measuredCosts.auditExecutions === 12));
  assert.ok(receipt.organizations.every((item) => item.correctionsApplied === 3));
  assert.equal(new Set(receipt.organizations.map((item) => item.outcomeHash)).size, 1);
  assert.equal(experiments.verifyOrganizationComparison(receipt, contracts), true);
}

const forged = structuredClone(coverage.receipts[0]);
forged.organizations[0].measuredCosts.messages = 0;
assert.equal(experiments.verifyOrganizationComparison(forged, contracts), false);
assert.equal(experiments.verifyOrganizationComparison({ ...coverage.receipts[0], promotionEligible: true }, contracts), false);

async function transport() {
  const receipt = await router.handlePhilosophyRequest({ request: {
    operation: 'runOrganizationComparison', arguments: { missionId: 'identity-continuity' },
  } });
  assert.equal(receipt.passed, true);
  const summary = await router.handlePhilosophyRequest({ request: {
    operation: 'organizationComparisonCoverage', arguments: {},
  } });
  assert.equal(summary.organizationRuns, 16);
  assert.ok(summary.receipts.every((item) => !item.organizations));
}

transport().then(() => console.log('Four in-process organizations execute sixteen paired mission runs with budget and outcome parity.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
