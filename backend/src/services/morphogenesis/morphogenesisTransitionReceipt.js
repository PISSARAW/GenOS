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
    genomeBinding: genomeBinding(worker),
    tokens: Number(continuation.workerTokens?.[index] ?? continuation.perWorkerTokens ?? 0) };
}

function genomeBinding(worker) {
  const binding = worker.genomeBinding || worker.phenotype?.genomeBinding;
  if (!binding?.genomeRef || !binding.contentHash) return null;
  return { genomeRef: binding.genomeRef, contentHash: binding.contentHash,
    phenotypeHash: binding.phenotypeHash || null, status: binding.status || null };
}

function admissionIdentity(admission) {
  const actualPlanDigest = admission?.actualPlan ? digest(admissionPlanIdentity(admission.actualPlan)) : null;
  return { status: admission?.status || null, executionAuthorized: admission?.executionAuthorized === true,
    selectionBasis: admission?.selectionBasis || null, comparativeQuality: admission?.comparativeQuality || null,
    unexecutedAlternatives: admission?.unexecutedAlternatives || null,
    counterfactual: admission?.counterfactual || null,
    recipe: admission?.recipe || null, gates: admission?.gates || null, actualPlanDigest };
}

function admissionPlanIdentity(plan) {
  return { selectedTopology: plan.selectedTopology || null, selectedVariant: plan.selectedVariant || null,
    strategyRecipeId: plan.strategyRecipeId || null, allocatedTokens: plan.allocatedTokens,
    requestedTools: plan.requestedTools || [], workers: admissionWorkers(plan) };
}

function admissionWorkers(plan) {
  if (!Array.isArray(plan.workerAssignments)) return [];
  return plan.workerAssignments.map(admissionWorker).sort((left, right) =>
    String(left.workerId).localeCompare(String(right.workerId)));
}

function admissionWorker(item) {
  return { workerId: item.workerId || item.agentId || null, workerKind: item.workerKind || null,
    topology: item.topology || item.morphologyTopology || null,
    variant: item.variant || item.morphologyVariant || null, tokens: item.tokenBudget };
}

function resourceAllocationIdentity(input, bindings) {
  const adaptation = input.adaptation;
  const resources = adaptation.decision?.resources;
  const candidate = resources?.candidate;
  const binding = adaptation.receipt?.resourceAllocationBinding;
  const effect = adaptation.receipt?.resourceAllocationEffect;
  if (!candidate && !binding && !effect) return null;
  const allocation = { candidateId: candidate?.candidateId || binding?.candidateId || null,
    planDigest: candidate?.planDigest || binding?.planDigest || null,
    selectedCandidateId: selectedResourceCandidate(adaptation),
    interventionScale: adaptation.decision?.policy?.decision?.interventionScale || 'NO_CHANGE',
    admission: admissionIdentity(adaptation.admission),
    effect: effectIdentity(effect, bindings) };
  validateResourceAllocationBinding({ candidate, binding, effect, allocation, adaptation });
  return allocation;
}

function selectedResourceCandidate(adaptation) {
  return adaptation.decision?.policy?.decision?.recipe?.resourceAllocationIntervention?.candidateId || null;
}

function effectIdentity(effect, bindings) {
  if (!effect) return null;
  const workers = effect.status === 'applied' ? bindings.map((item) => ({
    workerId: item.workerId, tokens: item.tokens
  })).sort((left, right) => left.workerId.localeCompare(right.workerId)) : [];
  return { status: effect.status, candidateId: effect.candidateId, planDigest: effect.planDigest,
    reason: effect.reason || null, budgetTokens: effect.budgetTokens,
    allocatedTokens: workers.reduce((sum, item) => sum + item.tokens, 0), workerTokenAllocations: workers };
}

function validateResourceAllocationBinding(context) {
  const { candidate, binding, effect, allocation, adaptation } = context;
  validateResourceBinding(context);
  validateResourceEffect(context);
  validateProvisionalTransition(binding, effect, adaptation.receipt);
  if (!candidate && !binding.candidateId) throw transitionError('MORPHOGENESIS_RESOURCE_CANDIDATE_MISSING');
}

function validateResourceBinding(context) {
  const { binding, allocation } = context;
  if (!binding || binding.candidateId !== allocation.candidateId
    || binding.planDigest !== allocation.planDigest) throw transitionError('MORPHOGENESIS_RESOURCE_BINDING_DIVERGED');
}

function validateResourceEffect(context) {
  const { candidate, effect, allocation } = context;
  if (!effect) return;
  if (effect.candidateId !== allocation.candidateId || effect.planDigest !== allocation.planDigest) {
    throw transitionError('MORPHOGENESIS_RESOURCE_EFFECT_DIVERGED');
  }
  if (!['applied', 'not_applied'].includes(effect.status)) throw transitionError('MORPHOGENESIS_RESOURCE_EFFECT_STATUS_INVALID');
  if (effect.status === 'applied') validateAppliedEffect({ candidate, effect, allocation });
}

function validateAppliedEffect(context) {
  const { candidate, effect, allocation } = context;
  if (!effectMatchesBindings(effect, allocation.effect)) throw transitionError('MORPHOGENESIS_RESOURCE_EFFECT_WORKERS_DIVERGED');
  const selected = allocation.interventionScale === 'RESOURCE_REALLOCATION'
    && allocation.selectedCandidateId === candidate?.candidateId && allocation.admission.status === 'admitted';
  if (!selected) throw transitionError('MORPHOGENESIS_RESOURCE_EFFECT_NOT_ADMITTED');
  if (!allocation.effect.workerTokenAllocations.length) throw transitionError('MORPHOGENESIS_RESOURCE_EFFECT_WORKERS_MISSING');
  if (effect.allocatedTokens !== allocation.effect.allocatedTokens || effect.budgetTokens < effect.allocatedTokens) {
    throw transitionError('MORPHOGENESIS_RESOURCE_EFFECT_BUDGET_DIVERGED');
  }
}

function validateProvisionalTransition(binding, effect, receipt) {
  if (binding.transitionId === receipt.transitionId
    && (!effect || effect.transitionId === receipt.transitionId)) return;
  throw transitionError('MORPHOGENESIS_RESOURCE_PROVISIONAL_TRANSITION_DIVERGED');
}

function effectMatchesBindings(effect, identityEffect) {
  const workers = (effect.workerTokenAllocations || []).slice()
    .sort((left, right) => left.workerId.localeCompare(right.workerId));
  return JSON.stringify(workers) === JSON.stringify(identityEffect.workerTokenAllocations)
    && effect.allocatedTokens === identityEffect.allocatedTokens
    && effect.budgetTokens >= identityEffect.allocatedTokens;
}

function bindingValid(binding, lightIntervention) {
  return Boolean(binding.workerKind && (lightIntervention || binding.topology)
    && Number.isSafeInteger(binding.tokens) && binding.tokens > 0);
}

function identityFor(context) {
  const { candidateId, admission, graph, bindings, totalTokens, communication,
    roster, input } = context;
  const identity = { candidateId, admissionBasis: admission.selectionBasis,
    admissionTopology: admission.recipe.topology, admissionVariant: admission.recipe.variant,
    comparativeQuality: admission.comparativeQuality || null,
    unexecutedAlternatives: admission.unexecutedAlternatives || null,
    counterfactual: admission.counterfactual || null,
    graph, bindings, totalTokens };
  const resourceAllocation = resourceAllocationIdentity(input, bindings);
  if (resourceAllocation) identity.resourceAllocation = resourceAllocation;
  if (communication) return { ...identity, communicationIntervention: communication,
    communicationMetricReceipt: input.adaptation.receipt.communicationMetricReceipt,
    communicationEffect: { removedLeases: require('./communicationReductionIntervention').COORDINATION_TOOLS,
      workers: expectedCommunicationWorkers(input, bindings) } };
  if (!roster) return identity;
  const availability = require('./rosterReductionIntervention')
    .describeAvailability(input.adaptation.rosterPlan);
  return { ...identity, rosterIntervention: roster,
    rosterEffect: { planDigest: availability.planDigest,
      retainedWorkerIds: availability.retainedWorkerIds.sort(),
      removedWorkerIds: availability.removedWorkerIds.sort() } };
}

function sealTransitionReceipt(input) {
  const receipt = input.adaptation.receipt;
  const admission = input.adaptation.admission;
  if (!receipt || admission?.status !== 'admitted') {
    throw transitionError('MORPHOGENESIS_TRANSITION_ADMISSION_MISSING');
  }
  const bindings = actualWorkerBindings(input);
  const communication = input.adaptation.communicationIntervention || null;
  const roster = input.adaptation.rosterIntervention || null;
  const lightIntervention = communication || roster;
  const graph = lightIntervention ? null : graphIdentity(input.adaptation);
  const candidateId = admission.recipe?.id;
  if (!candidateId || !bindings.length || !bindings.every((item) => bindingValid(item, lightIntervention))) {
    throw transitionError('MORPHOGENESIS_TRANSITION_BINDING_INCOMPLETE');
  }
  const totalTokens = bindings.reduce((sum, item) => sum + item.tokens, 0);
  receipt.strategyAdmission = admission;
  const identity = identityFor({ candidateId, admission, graph, bindings, totalTokens,
    communication, roster, input });
  const transitionId = `morph_${digest(identity)}`;
  finalizeResourceTransition(input.adaptation.receipt, transitionId);
  Object.assign(receipt, { transitionId, identity, dispatchStatus: 'prepared', queuedWorkerIds: [] });
  return receipt;
}

function finalizeResourceTransition(receipt, transitionId) {
  if (receipt.resourceAllocationBinding) receipt.resourceAllocationBinding.transitionId = transitionId;
  if (receipt.resourceAllocationEffect) receipt.resourceAllocationEffect.transitionId = transitionId;
}

function verifyTransitionReceipt(receipt) {
  if (!receipt?.transitionId || !receipt.identity || receipt.dispatchStatus === 'diverged') return false;
  return receipt.transitionId === `morph_${digest(receipt.identity)}`
    && resourceIdentityMatchesReceipt(receipt);
}

function resourceIdentityMatchesReceipt(receipt) {
  const identity = receipt.identity.resourceAllocation;
  const binding = receipt.resourceAllocationBinding;
  const effect = receipt.resourceAllocationEffect;
  if (!identity) return !binding && !effect;
  return resourceBindingMatches(binding, identity, receipt.transitionId)
    && resourceEffectMatches(effect, identity.effect, receipt.transitionId)
    && JSON.stringify(admissionIdentity(receipt.strategyAdmission)) === JSON.stringify(identity.admission);
}

function resourceBindingMatches(binding, identity, transitionId) {
  return Boolean(binding && binding.candidateId === identity.candidateId
    && binding.planDigest === identity.planDigest && binding.transitionId === transitionId);
}

function resourceEffectMatches(effect, identityEffect, transitionId) {
  if (!effect) return identityEffect === null;
  if (effect.transitionId !== transitionId || effect.candidateId !== identityEffect?.candidateId
    || effect.planDigest !== identityEffect?.planDigest || effect.status !== identityEffect?.status) return false;
  return JSON.stringify(sortedEffectWorkers(effect)) === JSON.stringify(identityEffect.workerTokenAllocations)
    && (effect.reason || null) === identityEffect.reason
    && effect.budgetTokens === identityEffect.budgetTokens
    && effect.allocatedTokens === identityEffect.allocatedTokens;
}

function sortedEffectWorkers(effect) {
  return (effect.workerTokenAllocations || []).slice()
    .sort((left, right) => left.workerId.localeCompare(right.workerId));
}

function resultMatchesTransition(result, receipt) {
  if (!verifyTransitionReceipt(receipt) || result?.transitionId !== receipt.transitionId) return false;
  return receipt.identity.bindings.some((binding) => binding.workerId === result.agentId
    && binding.workerKind === result.workerKind && binding.topology === result.topology
    && binding.variant === result.variant
    && binding.tokens === result.allocatedTokens);
}

function recordTransitionOutcomes(receipt, results) {
  // Declared usage only: worker-reported consumption is diagnostic, never
  // accounting proof. A sealed receipt alone never resolves; promotion needs
  // an independent oracle verdict bound to the same transitionId.
  receipt.observed = { usageSource: 'worker_declared', workers: results.map((result) => ({ workerId: result.agentId,
    status: result.status, allocatedTokens: result.allocatedTokens,
    declaredConsumedTokens: result.declaredConsumedTokens, declaredCostUsd: result.declaredCostUsd })) };
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

function rosterQueueMatches(receipt, missions) {
  const effect = receipt.identity.rosterEffect;
  return Array.isArray(missions) && missions.length === effect.retainedWorkerIds.length
    && missions.every((mission) => effect.retainedWorkerIds.includes(mission.agentId)
      && mission.rosterIntervention?.transitionId === receipt.transitionId
      && mission.rosterIntervention?.candidateId === receipt.identity.candidateId
      && mission.rosterIntervention?.planDigest === effect.planDigest
      && mission.rosterIntervention?.status === 'retained_at_epoch_boundary');
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
  if (receipt.identity.rosterEffect && !rosterQueueMatches(receipt, missions)) {
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
