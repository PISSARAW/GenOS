'use strict';

const MAX_REPLACEMENT_WORKERS = 12;

function requestedRosterSize(input) {
  const mission = input.state.normalizedMission || {};
  const policy = mission.morphogenesisPolicy || {};
  const configured = [policy.targetWorkers, policy.cohortSize, input.continuation.targetWorkerCount,
    input.continuation.workerCount, input.continuation.survivorCount]
    .find((value) => value !== undefined && value !== null);
  const requested = Number(configured ?? input.survivors.length);
  return Number.isSafeInteger(requested) ? Math.max(0, requested) : input.survivors.length;
}

function affordableRosterSize(input) {
  const budget = Math.max(0, Number(input.continuation.pool || 0));
  const minimum = Math.max(1, Number(input.state.plan.tokenPolicy?.minimumWorkerTokens
    || input.state.epochBudget?.minimum || input.continuation.perWorkerTokens || 1));
  return Math.floor(budget / minimum);
}

function targetRosterSize(input) {
  return Math.min(requestedRosterSize(input), affordableRosterSize(input), MAX_REPLACEMENT_WORKERS);
}

function fundedRosterReduction(input) {
  const requested = Number(input.continuation?.targetWorkerCount
    ?? input.continuation?.survivorCount);
  const current = input.state.workers instanceof Map
    ? input.state.workers.size : Number(input.state.plan.dispatchWorkers?.length || 0);
  return Number.isSafeInteger(requested) && requested > 0 && requested < current
    && requested === input.survivors.length && Number(input.continuation?.pool) > 0;
}

module.exports = { affordableRosterSize, fundedRosterReduction, requestedRosterSize, targetRosterSize };
