'use strict';

const { buildAllocation } = require('./tokenAllocationService');
const budgetPolicy = require('./workerTokenBudgetPolicy');

function profilesFor(tokenPolicy, workers) {
  const explicitMinimum = tokenPolicy.minimumWorkerTokensExplicit
    ?? Object.hasOwn(tokenPolicy, 'minimumWorkerTokens');
  const override = explicitMinimum
    ? tokenPolicy.minimumWorkerTokens : undefined;
  return budgetPolicy.profileWorkers(workers, override);
}

function hasRuntimeCeilingFailure(profiles) {
  return profiles.some(profile => profile.runtimeCeilingExceeded);
}

function envelopeFor(tokenPolicy, profiles) {
  const budget = tokenPolicy.explicitWorkerShare
    ? { workerShare: tokenPolicy.workerShare } : {};
  return budgetPolicy.budgetEnvelope(tokenPolicy.total, profiles, budget);
}

function affordableWorkerCount(tokenPolicy, workerShare, workers) {
  if (Array.isArray(workers)) {
    const profiles = profilesFor(tokenPolicy, workers);
    if (hasRuntimeCeilingFailure(profiles)) return 0;
    const envelope = envelopeFor(tokenPolicy, profiles);
    if (!envelope.valid) return 0;
    return envelope.workerPool >= budgetPolicy.sumField(profiles, 'minimumStartTokens')
      ? workers.length : 0;
  }
  return Math.floor((tokenPolicy.total * workerShare) / tokenPolicy.minimumWorkerTokens);
}

function buildRoundAllocation(tokenPolicy, workerShare, workers) {
  const workerCount = Array.isArray(workers) ? workers.length : workers;
  const profiles = Array.isArray(workers) ? profilesFor(tokenPolicy, workers) : null;
  const envelope = profiles ? envelopeFor(tokenPolicy, profiles) : null;
  return buildAllocation({
    totalTokens: tokenPolicy.total,
    workerShare: envelope?.workerShare ?? workerShare,
    workerCount,
    minimumWorkerTokens: tokenPolicy.minimumWorkerTokens,
    workerBudgets: profiles,
    mode: tokenPolicy.allocation
  });
}

function buildAdmission(input) {
  const { tokenPolicy, profiles, envelope, required, requestedShare } = input;
  const runtimeCeilingFailures = profiles.filter(profile => profile.runtimeCeilingExceeded);
  const runtimeCeilingFailure = runtimeCeilingFailures.length > 0;
  const funded = !runtimeCeilingFailure && envelope.valid && envelope.workerPool >= required;
  return { atomic: true, valid: funded, requestedWorkers: profiles.length,
    fundedWorkers: funded ? profiles.length : 0,
    availableWorkerTokens: envelope.workerPool, requiredWorkerTokens: required,
    shortfallTokens: Math.max(0, required - envelope.workerPool),
    minimumAcceptableTotal: runtimeCeilingFailure ? null : budgetPolicy.minimumAcceptableTotal(profiles,
      tokenPolicy.explicitWorkerShare ? { workerShare: requestedShare } : {}),
    runtimeCeilingFailures: runtimeCeilingFailures.map(profile => ({
      workerKind: profile.workerKind, role: profile.role,
      requestedMinimumTokens: profile.minimumStartTokens,
      runtimeMaximumTokens: profile.runtimeMaximumTokens
    })),
    reason: envelope.invalidReason || (runtimeCeilingFailure
      ? 'worker_minimum_exceeds_runtime_ceiling' : envelope.workerPool < required
        ? 'worker_budget_below_role_minimum' : null) };
}

function applyWorkerBudget(tokenPolicy, workers) {
  const profiles = profilesFor(tokenPolicy, workers);
  const requestedShare = tokenPolicy.workerShare;
  const envelope = envelopeFor(tokenPolicy, profiles);
  const required = budgetPolicy.sumField(profiles, 'minimumStartTokens');
  tokenPolicy.workerShare = envelope.workerShare;
  tokenPolicy.orchestratorReserve = envelope.orchestratorReserve;
  tokenPolicy.orchestratorReserveTokens = envelope.orchestratorReserveTokens;
  tokenPolicy.minimumOrchestratorReserveTokens = envelope.minimumOrchestratorReserveTokens;
  tokenPolicy.workerBudgets = profiles;
  tokenPolicy.rounds = buildRoundAllocation(tokenPolicy, envelope.workerShare, workers);
  tokenPolicy.admission = buildAdmission({ tokenPolicy, profiles, envelope, required, requestedShare });
  return tokenPolicy;
}

module.exports = { affordableWorkerCount, buildRoundAllocation, applyWorkerBudget };
