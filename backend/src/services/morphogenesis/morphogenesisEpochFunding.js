'use strict';

const describeResourceReallocation = require('./resourceReallocationCandidate').describeResourceReallocation;

function workerGroup(state, workerId) {
  const id = typeof workerId === 'object' ? workerId.agentId : workerId;
  const worker = { ...(state.workers.get(id) || {}), ...(typeof workerId === 'object' ? workerId : {}) };
  return String(worker.groupId || worker.morphologyTopology || worker.role || 'mission');
}

function groupAllocations(resources, budget) {
  const sleeping = sleepingGroups(resources);
  const allocations = resources.candidate
    ? resources.allocations : boundedAllocations(resources.allocations, sleeping, budget);
  const amounts = new Map();
  for (const allocation of allocations || []) {
    amounts.set(allocation.groupId, (amounts.get(allocation.groupId) || 0) + allocation.allocatedTokens);
  }
  return { amounts, sleeping };
}

function sleepingGroups(resources) {
  return new Set((resources?.groupStates || [])
    .filter((group) => group.state === 'sleeping').map((group) => group.groupId));
}

function boundedAllocations(allocations = [], sleeping, budget) {
  let remaining = budget;
  return allocations.map((item) => {
    if (sleeping.has(item.groupId)) return { ...item, allocatedTokens: 0 };
    const tokens = allocationTokens(item, remaining);
    remaining -= tokens;
    return { ...item, allocatedTokens: tokens };
  });
}

function allocationTokens(item, remaining) {
  const requested = Math.max(0, Number(item.requestedTokens || item.allocatedTokens) || 0);
  const minimum = Math.max(0, Number(item.minimumTokens) || 0);
  return requested && remaining >= minimum ? Math.min(requested, remaining) : 0;
}

function admittedResourceAllocation(adaptation) {
  const decision = adaptation.decision || {};
  const resources = decision.resources;
  const descriptor = resources?.candidate;
  const binding = adaptation.receipt?.resourceAllocationBinding;
  const recipeId = decision.policy?.decision?.recipe?.resourceAllocationIntervention?.candidateId;
  const recomputed = resources ? describeResourceReallocation(resources) : {};
  return decision.policy?.decision?.interventionScale === 'RESOURCE_REALLOCATION'
    && resourceCandidateMatches(recipeId, descriptor, recomputed)
    && receiptMatches(binding, descriptor, adaptation.receipt)
    && adaptation.admission?.status === 'admitted' ? resources : null;
}

function resourceCandidateMatches(recipeId, descriptor, recomputed) {
  return descriptor?.status === 'available' && recipeId === descriptor.candidateId
    && recomputed.candidateId === descriptor.candidateId && recomputed.planDigest === descriptor.planDigest;
}

function receiptMatches(binding, descriptor, receipt) {
  return binding?.candidateId === descriptor?.candidateId
    && binding?.planDigest === descriptor?.planDigest
    && binding?.transitionId === receipt?.transitionId;
}

function allocationContext(input) {
  const adaptation = input.adaptation;
  const challengeReserve = adaptation.decision?.challenge?.challenge?.reservedTokens || 0;
  return { resources: admittedResourceAllocation(adaptation), challengeReserve,
    usableTokens: Math.max(0, input.reservation.reservedTokens - challengeReserve) };
}

function equalFunding(input, context, reason) {
  const count = input.survivors.length;
  const tokens = count ? Math.floor(context.usableTokens / count) : 0;
  const funded = tokens >= input.state.epochBudget.minimum ? { survivors: input.survivors,
    workerTokens: input.survivors.map(() => tokens) } : { survivors: [], workerTokens: [] };
  if (reason) recordResourceEffect(input, null, reason);
  return addChallengeReserve(input, funded, context.challengeReserve);
}

function plannedTokens(amounts) {
  return [...amounts.values()].reduce((sum, amount) => sum + amount, 0);
}

function allocationGroups(input) {
  const groups = new Map();
  for (const survivor of input.survivors) {
    const group = workerGroup(input.state, survivor);
    groups.set(group, [...(groups.get(group) || []), survivor]);
  }
  return groups;
}

function applyNegotiatedAllocation(input, context) {
  const requested = groupAllocations(context.resources, Number.MAX_SAFE_INTEGER);
  if (context.resources.candidate && plannedTokens(requested.amounts) > context.usableTokens) {
    return equalFunding(input, context, 'funded_budget_mismatch');
  }
  const { amounts, sleeping } = groupAllocations(context.resources, context.usableTokens);
  const groups = allocationGroups(input);
  const fallbackGroups = [...groups].filter(([group]) => !amounts.has(group) && !sleeping.has(group));
  const fallbackCount = fallbackGroups.reduce((sum, [, members]) => sum + members.length, 0);
  const unallocated = Math.max(0, context.usableTokens - plannedTokens(amounts));
  const fallbackTokens = fallbackCount ? Math.floor(unallocated / fallbackCount) : 0;
  const funded = fundedMembers(groups, { amounts, sleeping, fallbackTokens,
    minimum: input.state.epochBudget.minimum });
  const withReserve = addChallengeReserve(input, funded, context.challengeReserve);
  recordResourceEffect(input, withReserve, 'applied');
  return withReserve;
}

function allocateNegotiatedWorkers(input) {
  const context = allocationContext(input);
  if (!context.resources) return equalFunding(input, context,
    input.adaptation.decision?.resources ? 'not_selected_or_not_admitted' : null);
  return applyNegotiatedAllocation(input, context);
}

function recordResourceEffect(input, funded, reason) {
  const descriptor = input.adaptation.decision?.resources?.candidate;
  const receipt = input.adaptation.receipt;
  if (!descriptor?.candidateId || !receipt) return;
  receipt.resourceAllocationEffect = { status: funded ? 'applied' : 'not_applied',
    reason: funded ? null : reason, candidateId: descriptor.candidateId,
    planDigest: descriptor.planDigest, transitionId: receipt.transitionId,
    budgetTokens: input.reservation.reservedTokens,
    allocatedTokens: funded ? funded.workerTokens.reduce((sum, tokens) => sum + tokens, 0) : 0,
    workerTokenAllocations: funded ? funded.survivors.map((worker, index) => ({
      workerId: worker.agentId, tokens: funded.workerTokens[index]
    })) : [] };
}

function addChallengeReserve(input, funded, reserve) {
  if (!reserve) return funded;
  const assignment = input.adaptation.cohortBlueprint?.assignments?.find((item) => item.strategyChallenge);
  const challenger = assignment?.candidateId || assignment?.sourceAgentId
    || Object.entries(input.adaptation.assignments || {}).find(([, item]) => item.strategyChallenge)?.[0];
  const index = funded.survivors.findIndex((survivor) => survivor.agentId === challenger);
  if (index >= 0) funded.workerTokens[index] += reserve;
  return funded;
}

function fundedMembers(groups, policy) {
  const survivors = [];
  const workerTokens = [];
  for (const [group, members] of groups) {
    const tokens = policy.sleeping.has(group) ? 0
      : policy.amounts.has(group) ? Math.floor(policy.amounts.get(group) / members.length) : policy.fallbackTokens;
    if (tokens < policy.minimum) continue;
    for (const survivor of members) {
      survivors.push(survivor);
      workerTokens.push(tokens);
    }
  }
  return { survivors, workerTokens };
}

module.exports = { allocateNegotiatedWorkers };
