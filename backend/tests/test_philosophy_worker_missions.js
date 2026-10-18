'use strict';

const assert = require('node:assert/strict');
const { validateRegistry } = require('../src/philosophy/conceptRegistry');
const { compileRegistry } = require('../src/philosophy/implementationContracts');
const workers = require('../src/philosophy/workerMissionExperiments');
const router = require('../src/services/philosophyRouter');

const contracts = compileRegistry(validateRegistry().concepts).contracts;

async function main() {
  const receipt = await workers.runWorkerMission(contracts, {
    missionId: 'identity-continuity', organization: 'centralized',
    dispatchNonce: 'phase-7-replay',
  });
  assert.equal(receipt.passed, true);
  assert.equal(receipt.measuredCosts.workerDispatches, 3);
  assert.equal(receipt.measuredCosts.auditExecutions, 12);
  assert.equal(receipt.actualMissionExecution, true);
  assert.equal(receipt.actualOrganizationExecution, true);
  assert.equal(receipt.actualWorkerDispatch, true);
  assert.equal(receipt.actualTopologyExecution, false);
  assert.equal(receipt.externalFactsVerified, false);
  assert.equal(receipt.independentValidation, false);
  assert.equal(receipt.promotionEligible, false);
  assert.equal(receipt.workerMessages.length, 6);
  assert.ok(receipt.comparisons.every((item) => item.correctionApplied));
  assert.equal(await workers.verifyWorkerMission(receipt, contracts), true);

  const forged = structuredClone(receipt);
  forged.workerMessages[1].resultHash = '0'.repeat(64);
  assert.equal(await workers.verifyWorkerMission(forged, contracts), false);
  assert.equal(await workers.verifyWorkerMission({ ...receipt, actualTopologyExecution: true }, contracts), false);
  await assert.rejects(() => workers.runWorkerMission(contracts, {
    missionId: 'identity-continuity', organization: 'invented',
  }), /PHILOSOPHY_ORGANIZATION_INVALID/);

  const coverage = await workers.runWorkerCoverage(contracts);
  assert.equal(coverage.missionCount, 4);
  assert.equal(coverage.organizationRuns, 16);
  assert.equal(coverage.workerDispatches, 48);
  assert.equal(coverage.passed, 16);
  assert.deepEqual(coverage.failed, []);
  assert.equal(coverage.actualWorkerDispatch, true);
  assert.equal(coverage.actualTopologyExecution, false);

  const routed = await router.handlePhilosophyRequest({ request: {
    operation: 'runWorkerPhilosophyMission',
    arguments: { missionId: 'causal-attribution', organization: 'federated' },
  } });
  assert.equal(routed.passed, true);
  assert.equal(routed.actualWorkerDispatch, true);
  const summary = await router.handlePhilosophyRequest({ request: {
    operation: 'workerPhilosophyCoverage', arguments: {},
  } });
  assert.equal(summary.organizationRuns, 16);
  assert.equal(summary.workerDispatches, 48);
  assert.ok(summary.receipts.every((item) => !item.comparisons && !item.workerMessages));
  console.log('Phase 7 dispatched 48 isolated worker audits across 16 bounded mission organizations.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
