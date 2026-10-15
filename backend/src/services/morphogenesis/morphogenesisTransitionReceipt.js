'use strict';

const crypto = require('node:crypto');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function graphIdentity(adaptation) {
  const graph = adaptation?.plan?.morphologyPatch?.graph;
  if (!graph) throw transitionError('MORPHOGENESIS_TRANSITION_GRAPH_MISSING');
  return { graphId: graph.graphId || null, version: graph.version || null, digest: digest(graph) };
}

function actualWorkerBindings(input) {
  return input.survivors.map((survivor, index) => workerBinding(input, survivor, index));
}

function expectedCommunicationWorkers(input, bindings) {
  const removed = new Set(require('./communicationReductionIntervention').COORDINATION_TOOLS);
  return bindings.map((binding) => {
    const worker = input.state.workers.get(binding.workerId) || {};
    return { workerId: binding.workerId, tokenBudget: binding.tokens, cadence: 'barrier_only',
      toolLease: (worker.toolLease || []).filter((tool) => !removed.has(tool)) };
  });
}

function workerBinding(input, survivor, index) {
  const { state, continuation } = input;
  const worker = state.workers.get(survivor.agentId) || {};
  return { workerId: survivor.agentId, workerKind: worker.workerKind || null,
    topology: worker.morphologyTopology || null, variant: worker.morphologyVariant || null,
    tokens: Number(continuation.workerTokens?.[index] ?? continuation.perWorkerTokens ?? 0) };
}

function bindingValid(binding, communication) {
  return Boolean(binding.workerKind && (communication || binding.topology)
    && Number.isSafeInteger(binding.tokens) && binding.tokens > 0);
}

function identityFor(context) {
  const { candidateId, admission, graph, bindings, totalTokens, communication, input } = context;
  const identity = { candidateId, admissionBasis: admission.selectionBasis,
    admissionTopology: admission.recipe.topology, admissionVariant: admission.recipe.variant,
    graph, bindings, totalTokens };
  if (!communication) return identity;
  return { ...identity, communicationIntervention: communication,
    communicationMetricReceipt: input.adaptation.receipt.communicationMetricReceipt,
    communicationEffect: { removedLeases: require('./communicationReductionIntervention').COORDINATION_TOOLS,
      workers: expectedCommunicationWorkers(input, bindings) } };
}

function sealTransitionReceipt(input) {
  const receipt = input.adaptation.receipt;
  const admission = input.adaptation.admission;
  if (!receipt || admission?.status !== 'admitted') {
    throw transitionError('MORPHOGENESIS_TRANSITION_ADMISSION_MISSING');
  }
  const bindings = actualWorkerBindings(input);
  const communication = input.adaptation.communicationIntervention || null;
  const graph = communication ? null : graphIdentity(input.adaptation);
  const candidateId = admission.recipe?.id;
  if (!candidateId || !bindings.length || !bindings.every((item) => bindingValid(item, communication))) {
    throw transitionError('MORPHOGENESIS_TRANSITION_BINDING_INCOMPLETE');
  }
  const totalTokens = bindings.reduce((sum, item) => sum + item.tokens, 0);
  const identity = identityFor({ candidateId, admission, graph, bindings, totalTokens, communication, input });
  const transitionId = `morph_${digest(identity)}`;
  Object.assign(receipt, { transitionId, identity, dispatchStatus: 'prepared', queuedWorkerIds: [] });
  return receipt;
}

function verifyTransitionReceipt(receipt) {
  if (!receipt?.transitionId || !receipt.identity || receipt.dispatchStatus === 'diverged') return false;
  return receipt.transitionId === `morph_${digest(receipt.identity)}`;
}

function resultMatchesTransition(result, receipt) {
  if (!verifyTransitionReceipt(receipt) || result?.transitionId !== receipt.transitionId) return false;
  return receipt.identity.bindings.some((binding) => binding.workerId === result.agentId
    && binding.workerKind === result.workerKind && binding.topology === result.topology
    && binding.tokens === result.allocatedTokens);
}

function recordTransitionOutcomes(receipt, results) {
  receipt.observed = { workers: results.map((result) => ({ workerId: result.agentId,
    status: result.status, allocatedTokens: result.allocatedTokens,
    consumedTokens: result.consumedTokens, costUsd: result.costUsd })) };
}

function communicationMarkerMatches(receipt, mission) {
  const marker = mission.communicationIntervention || {};
  const metricId = receipt.identity.communicationMetricReceipt?.resultId;
  return marker.transitionId === receipt.transitionId && marker.candidateId === receipt.identity.candidateId
    && marker.metricId === metricId && marker.metricReceiptId === metricId
    && marker.status === 'applied_at_epoch_boundary';
}

function communicationPolicyMatches(receipt, mission, expected) {
  const policy = mission.coordinationPolicy || mission.coordination_policy || {};
  return (policy.communicationCadence || policy.communication_cadence) === expected.cadence
    && JSON.stringify(mission.toolLease || []) === JSON.stringify(expected.toolLease);
}

function queuedCommunicationMatches(receipt, mission) {
  const expected = receipt.identity.communicationEffect.workers.find((item) => item.workerId === mission.agentId);
  return Boolean(expected && mission.budgetRound?.transitionId === receipt.transitionId
    && mission.executionBudget?.tokens === expected.tokenBudget
    && communicationMarkerMatches(receipt, mission)
    && communicationPolicyMatches(receipt, mission, expected));
}

function communicationQueueMatches(receipt, missions) {
  const expected = receipt.identity.communicationEffect.workers;
  return Array.isArray(missions) && missions.length === expected.length
    && missions.every((mission) => queuedCommunicationMatches(receipt, mission));
}

function finalizeTransitionQueue(receipt, queued, missions = []) {
  const expected = receipt.identity.bindings.map((item) => item.workerId).sort();
  const actual = [...queued].sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    receipt.dispatchStatus = 'diverged';
    throw transitionError('MORPHOGENESIS_TRANSITION_QUEUE_DIVERGED');
  }
  if (receipt.identity.communicationEffect && !communicationQueueMatches(receipt, missions)) {
    receipt.dispatchStatus = 'diverged';
    throw transitionError('MORPHOGENESIS_TRANSITION_EFFECT_DIVERGED');
  }
  receipt.queuedWorkerIds = actual;
  receipt.dispatchStatus = 'queued';
}

function transitionError(code) {
  return Object.assign(new Error(code), { code });
}

module.exports = { sealTransitionReceipt, verifyTransitionReceipt, resultMatchesTransition,
  finalizeTransitionQueue, recordTransitionOutcomes };
