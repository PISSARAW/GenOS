'use strict';

const { execute } = require('./contractRuntime');
const { fixture } = require('./contractExperiments');
const { digest, contractFingerprint } = require('./contractFingerprint');

const MISSIONS = Object.freeze([
  Object.freeze({ id: 'identity-continuity', objective: 'Corriger une rupture de continuité fonctionnelle.',
    contractIds: Object.freeze(['core.self', 'ontology.identity-change', 'time.arrow']) }),
  Object.freeze({ id: 'causal-attribution', objective: 'Refuser une attribution causale sans comparaison contrôlée.',
    contractIds: Object.freeze(['core.intervention-not-metaphor', 'causality.counterfactuals', 'causality.determinism-indeterminism']) }),
  Object.freeze({ id: 'biomimetic-effect', objective: 'Mesurer un effet biomimétique sans promouvoir une métaphore.',
    contractIds: Object.freeze(['core.biomimetic-experimental', 'biomimetic.chemotaxis', 'biomimetic.affinity-maturation']) }),
  Object.freeze({ id: 'bounded-obligations', objective: 'Corriger des obligations absentes et conserver leur portée.',
    contractIds: Object.freeze(['ethics.deontology', 'ethics.social-contract', 'logic.deontic']) }),
]);

const BUDGET = Object.freeze({ maxAuditExecutions: 12, maxObservationBytes: 64 * 1024 });

function observationBytes(...values) {
  return values.reduce((sum, value) => sum + Buffer.byteLength(JSON.stringify(value)), 0);
}

function runPair(contract) {
  const failing = fixture(contract, 'counterexample');
  const corrected = fixture(contract, 'satisfying');
  const controlFailure = execute(contract, { observations: failing, state: {}, enabled: false });
  const controlCorrection = execute(contract, { observations: corrected, state: controlFailure.after, enabled: false });
  const treatmentFailure = execute(contract, { observations: failing, state: {}, enabled: true });
  const treatmentCorrection = execute(contract, {
    observations: corrected, state: treatmentFailure.after, enabled: true,
  });
  const correctionApplied = treatmentFailure.assessment.status === 'violated'
    && treatmentCorrection.assessment.status === 'satisfied'
    && treatmentFailure.after.verificationTasks.length === 1
    && treatmentCorrection.after.verificationTasks.length === 0;
  return {
    contractId: contract.id, contractHash: contractFingerprint(contract),
    sameInputs: controlFailure.inputHash === treatmentFailure.inputHash
      && controlCorrection.inputHash === treatmentCorrection.inputHash,
    controlStateHash: digest(controlCorrection.after), treatmentStateHash: digest(treatmentCorrection.after),
    failingStatus: treatmentFailure.assessment.status,
    correctedStatus: treatmentCorrection.assessment.status,
    correctionApplied, auditExecutions: 4,
    observationBytes: observationBytes(failing, corrected, failing, corrected),
    obligationsEvaluated: contract.obligations.length,
  };
}

function missionDefinition(missionId) {
  const mission = MISSIONS.find((item) => item.id === missionId);
  if (!mission) throw new Error('Unknown representative philosophy mission');
  return mission;
}

function selectedContracts(contracts, mission) {
  const byId = new Map(contracts.map((contract) => [contract.id, contract]));
  const selected = mission.contractIds.map((id) => byId.get(id));
  if (selected.some((contract) => !contract)) throw new Error('Representative mission contract unavailable');
  return selected;
}

function runRepresentativeMission(contracts, missionId) {
  const mission = missionDefinition(missionId);
  const comparisons = selectedContracts(contracts, mission).map(runPair);
  const measuredCosts = {
    auditExecutions: comparisons.reduce((sum, item) => sum + item.auditExecutions, 0),
    observationBytes: comparisons.reduce((sum, item) => sum + item.observationBytes, 0),
  };
  const withinBudget = measuredCosts.auditExecutions <= BUDGET.maxAuditExecutions
    && measuredCosts.observationBytes <= BUDGET.maxObservationBytes;
  const passed = withinBudget && comparisons.every((item) => item.sameInputs && item.correctionApplied);
  const payload = {
    apiVersion: 'genos.representative-philosophy-mission/v1', kind: 'representative-mission-receipt',
    missionId: mission.id, objective: mission.objective, contractIds: [...mission.contractIds],
    budget: { ...BUDGET }, measuredCosts,
    correctionsApplied: comparisons.filter((item) => item.correctionApplied).length,
    obligationsEvaluated: comparisons.reduce((sum, item) => sum + item.obligationsEvaluated, 0),
    comparisons, passed, actualMissionExecution: true, actualTopologyExecution: false,
    externalFactsVerified: false, independentValidation: false,
  };
  return { ...payload, receiptHash: digest(payload), promotionEligible: false };
}

function receiptPayload(receipt) {
  const { receiptHash, promotionEligible, ...payload } = receipt;
  return payload;
}

function representativeBoundaries(receipt) {
  return receipt?.kind === 'representative-mission-receipt'
    && receipt.actualMissionExecution === true && receipt.actualTopologyExecution === false
    && receipt.externalFactsVerified === false && receipt.independentValidation === false
    && receipt.promotionEligible === false;
}

function verifyRepresentativeMission(receipt, contracts) {
  if (!representativeBoundaries(receipt)) return false;
  if (receipt.receiptHash !== digest(receiptPayload(receipt))) return false;
  try {
    const replay = runRepresentativeMission(contracts, receipt.missionId);
    return replay.passed && replay.receiptHash === receipt.receiptHash;
  } catch {
    return false;
  }
}

function runRepresentativeCoverage(contracts) {
  const receipts = MISSIONS.map((mission) => runRepresentativeMission(contracts, mission.id));
  return {
    missionCount: receipts.length, passed: receipts.filter((receipt) => receipt.passed).length,
    failed: receipts.filter((receipt) => !receipt.passed).map((receipt) => receipt.missionId),
    contractExecutions: receipts.reduce((sum, receipt) => sum + receipt.measuredCosts.auditExecutions, 0),
    scope: 'representative-local-runtime-audit', executedRepresentativeMissions: receipts.length,
    validatedOnRealMissions: 0,
    actualTopologyExecution: false, independentValidation: false, promotionEligible: false, receipts,
  };
}

function listRepresentativeMissions() {
  return MISSIONS.map((mission) => ({ ...mission, contractIds: [...mission.contractIds], budget: { ...BUDGET } }));
}

module.exports = { listRepresentativeMissions, runRepresentativeMission,
  verifyRepresentativeMission, runRepresentativeCoverage,
  runRepresentativePair: runPair,
  representativeMissionPlan: (contracts, missionId) => {
    const mission = missionDefinition(missionId);
    return { mission, contracts: selectedContracts(contracts, mission), budget: { ...BUDGET } };
  } };
