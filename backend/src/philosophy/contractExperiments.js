'use strict';

const { execute } = require('./contractRuntime');
const { probeValues } = require('./operationalPredicates');
const { digest, contractFingerprint } = require('./contractFingerprint');
const { simulateAuditDistribution } = require('./topologyAuditSimulation');

const TOPOLOGIES = Object.freeze(['isolated_critics', 'centralized', 'federated', 'peer_to_peer']);
const SEEDS = Object.freeze([17, 42, 99]);
const MODES = Object.freeze(['satisfying', 'counterexample', 'missing']);

function fixture(contract, mode) {
  const [positive, negative] = probeValues(contract.execution.predicate);
  const value = mode === 'satisfying' ? positive : negative;
  return mode === 'missing' ? {} : { [contract.execution.field]: value };
}

function sample(contract, spec, executor) {
  const observations = fixture(contract, spec.mode);
  const request = { observations, state: {}, enabled: true };
  const active = executor(contract, request);
  const control = executor(contract, { ...request, enabled: false });
  const repeated = executor(contract, request);
  const distribution = simulateAuditDistribution(active.assessment, spec);
  const expected = spec.mode === 'satisfying' ? 'satisfied' : spec.mode === 'missing' ? 'unobserved' : 'violated';
  const delta = active.after.verificationTasks?.length || 0;
  const passed = active.assessment.status === expected
    && digest(active.after) !== digest(control.after)
    && digest(active) === digest(repeated)
    && (spec.mode === 'satisfying' ? delta === 0 : delta === 1);
  return { ...spec, observations, active, control, distribution, repeatedHash: digest(repeated), passed };
}

function cases(contract, executor) {
  // The software audit is propagated in a deterministic graph simulation.
  // This is NOT an actual orchestration dispatch or a production measurement.
  return TOPOLOGIES.flatMap((topology) => SEEDS.flatMap((seed) => MODES
    .map((mode) => sample(contract, { topology, seed, mode }, executor))));
}

function runContractExperiment(contract, options = {}) {
  const observations = cases(contract, options.executor || execute);
  const passed = observations.every((item) => item.passed);
  const payload = {
    apiVersion: 'genos.contract-evidence/v1', kind: 'scenario-receipt',
    contractId: contract.id, contractHash: contractFingerprint(contract),
    scope: 'bounded-software-audit', issuer: 'contractExperiments',
    externalFactsVerified: false, actualTopologyExecution: false,
    independentValidation: false, observations, passed,
  };
  return { ...payload, receiptHash: digest(payload), promotionEligible: false };
}

function payloadOf(receipt) {
  const { receiptHash, promotionEligible, ...payload } = receipt;
  return payload;
}

function verifyScenarioReceipt(receipt, contract) {
  if (!receipt || receipt.kind !== 'scenario-receipt') return false;
  if (receipt.contractId !== contract.id || receipt.contractHash !== contractFingerprint(contract)) return false;
  if (receipt.scope !== 'bounded-software-audit' || receipt.passed !== true) return false;
  if (receipt.receiptHash !== digest(payloadOf(receipt))) return false;
  const replay = runContractExperiment(contract);
  return replay.passed && receipt.receiptHash === replay.receiptHash;
}

function runRegistryExperiments(contracts) {
  const receipts = contracts.map((contract) => runContractExperiment(contract));
  return {
    total: contracts.length, tested: receipts.filter((receipt) => receipt.passed).length,
    failed: receipts.filter((receipt) => !receipt.passed).map((receipt) => receipt.contractId),
    caseCount: receipts.reduce((sum, receipt) => sum + receipt.observations.length, 0),
    scope: 'bounded-software-audit', integratedOnRealMissions: 0, validatedOnRealMissions: 0,
    actualTopologyExecution: false, receipts, promotionEligible: false,
  };
}

module.exports = { TOPOLOGIES, SEEDS, fixture, runContractExperiment, verifyScenarioReceipt, runRegistryExperiments };
