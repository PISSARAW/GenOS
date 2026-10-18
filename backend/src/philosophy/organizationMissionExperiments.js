'use strict';

const { digest } = require('./contractFingerprint');
const { listRepresentativeMissions, representativeMissionPlan,
  runRepresentativePair } = require('./representativeMissionExperiments');

const ORGANIZATIONS = Object.freeze(['centralized', 'federated', 'peer_to_peer', 'isolated_critics']);
const MAX_MESSAGES = 12;

function orderContracts(contracts, organization) {
  if (organization === 'peer_to_peer') return [...contracts].reverse();
  if (organization === 'isolated_critics') return [...contracts].sort((a, b) => a.id.localeCompare(b.id));
  return [...contracts];
}

function centralizedMessages(ids) {
  return ids.flatMap((id, index) => [
    { from: 'coordinator', to: `worker:${index}`, contractId: id, round: 1, kind: 'dispatch' },
    { from: `worker:${index}`, to: 'coordinator', contractId: id, round: 2, kind: 'result' },
  ]);
}

function federatedMessages(ids) {
  const nodes = ids.map((_, index) => `federation:${index}`);
  return [
    { from: 'origin', to: nodes[0], contractId: ids[0], round: 1, kind: 'dispatch' },
    ...ids.slice(1).map((id, index) => ({ from: nodes[index], to: nodes[index + 1],
      contractId: id, round: index + 2, kind: 'handoff' })),
    { from: nodes.at(-1), to: 'origin', contractId: ids.at(-1), round: ids.length + 1, kind: 'aggregate' },
  ];
}

function peerMessages(ids) {
  return ids.flatMap((id, from) => ids.map((_, to) => ({ from: `peer:${from}`, to: `peer:${to}`,
    contractId: id, round: 2, kind: 'broadcast' })).filter((message) => message.from !== message.to));
}

function criticMessages(ids) {
  return ids.flatMap((id, index) => [
    { from: 'observer', to: `critic:${index}`, contractId: id, round: 1, kind: 'isolate' },
    { from: `critic:${index}`, to: 'observer', contractId: id, round: 2, kind: 'critique' },
  ]);
}

function messageTrace(organization, ids) {
  if (organization === 'centralized') return centralizedMessages(ids);
  if (organization === 'federated') return federatedMessages(ids);
  if (organization === 'peer_to_peer') return peerMessages(ids);
  return criticMessages(ids);
}

function outcomeHash(comparisons) {
  return digest([...comparisons].sort((a, b) => a.contractId.localeCompare(b.contractId)).map((item) => ({
    contractId: item.contractId, contractHash: item.contractHash, failingStatus: item.failingStatus,
    correctedStatus: item.correctedStatus, correctionApplied: item.correctionApplied,
    controlStateHash: item.controlStateHash, treatmentStateHash: item.treatmentStateHash,
  })));
}

function executeOrganization(plan, organization) {
  const ordered = orderContracts(plan.contracts, organization);
  const comparisons = ordered.map(runRepresentativePair);
  const messages = messageTrace(organization, ordered.map((contract) => contract.id));
  const measuredCosts = {
    auditExecutions: comparisons.reduce((sum, item) => sum + item.auditExecutions, 0),
    observationBytes: comparisons.reduce((sum, item) => sum + item.observationBytes, 0),
    messages: messages.length,
  };
  const withinBudget = measuredCosts.auditExecutions <= plan.budget.maxAuditExecutions
    && measuredCosts.observationBytes <= plan.budget.maxObservationBytes && messages.length <= MAX_MESSAGES;
  return {
    organization, taskOrder: ordered.map((contract) => contract.id), messages,
    convergenceRounds: Math.max(...messages.map((message) => message.round)),
    measuredCosts, outcomeHash: outcomeHash(comparisons),
    correctionsApplied: comparisons.filter((item) => item.correctionApplied).length,
    passed: withinBudget && comparisons.every((item) => item.sameInputs && item.correctionApplied),
  };
}

function runOrganizationComparison(contracts, missionId) {
  const plan = representativeMissionPlan(contracts, missionId);
  const organizations = ORGANIZATIONS.map((name) => executeOrganization(plan, name));
  const budgetParity = organizations.every((item) => item.measuredCosts.auditExecutions === 12
    && item.measuredCosts.observationBytes === organizations[0].measuredCosts.observationBytes);
  const outcomeParity = organizations.every((item) => item.outcomeHash === organizations[0].outcomeHash);
  const payload = {
    apiVersion: 'genos.philosophy-organization-comparison/v1', kind: 'organization-comparison-receipt',
    missionId: plan.mission.id, contractIds: [...plan.mission.contractIds],
    budget: { ...plan.budget, maxMessages: MAX_MESSAGES }, organizations,
    budgetParity, outcomeParity, passed: budgetParity && outcomeParity && organizations.every((item) => item.passed),
    actualOrganizationExecution: true, actualWorkerDispatch: false, actualTopologyExecution: false,
    externalFactsVerified: false, independentValidation: false,
  };
  return { ...payload, receiptHash: digest(payload), promotionEligible: false };
}

function payloadOf(receipt) {
  const { receiptHash, promotionEligible, ...payload } = receipt;
  return payload;
}

function organizationBoundaries(receipt) {
  return receipt?.kind === 'organization-comparison-receipt'
    && receipt.actualOrganizationExecution === true && receipt.actualWorkerDispatch === false
    && receipt.actualTopologyExecution === false && receipt.independentValidation === false
    && receipt.externalFactsVerified === false && receipt.promotionEligible === false;
}

function verifyOrganizationComparison(receipt, contracts) {
  if (!organizationBoundaries(receipt)) return false;
  if (receipt.receiptHash !== digest(payloadOf(receipt))) return false;
  try {
    const replay = runOrganizationComparison(contracts, receipt.missionId);
    return replay.passed && replay.receiptHash === receipt.receiptHash;
  } catch {
    return false;
  }
}

function runOrganizationCoverage(contracts) {
  const receipts = listRepresentativeMissions().map((mission) => runOrganizationComparison(contracts, mission.id));
  return {
    missionCount: receipts.length, organizationRuns: receipts.length * ORGANIZATIONS.length,
    passed: receipts.filter((receipt) => receipt.passed).length,
    failed: receipts.filter((receipt) => !receipt.passed).map((receipt) => receipt.missionId),
    actualOrganizationExecution: true, actualTopologyExecution: false,
    independentValidation: false, promotionEligible: false, receipts,
  };
}

module.exports = { ORGANIZATIONS, runOrganizationComparison,
  verifyOrganizationComparison, runOrganizationCoverage,
  orderContracts, messageTrace, organizationOutcomeHash: outcomeHash };
