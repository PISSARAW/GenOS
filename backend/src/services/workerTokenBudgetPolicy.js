'use strict';

const DEFAULT_PROFILE = Object.freeze({ minimumStartTokens: 8000, targetTokens: 12000, maximumTokens: 20000 });
const PROFILES = Object.freeze({
  scout_cell: { minimumStartTokens: 3000, targetTokens: 5000, maximumTokens: 8000 },
  procedural_executor: { minimumStartTokens: 0, targetTokens: 0, maximumTokens: 0 },
  formal_worker: { minimumStartTokens: 0, targetTokens: 0, maximumTokens: 0 },
  verifier_worker: { minimumStartTokens: 5000, targetTokens: 8000, maximumTokens: 14000 },
  red_worker: { minimumStartTokens: 5000, targetTokens: 8000, maximumTokens: 14000 },
  synthesis_worker: { minimumStartTokens: 6000, targetTokens: 10000, maximumTokens: 16000 },
  sub_orchestrator: { minimumStartTokens: 12000, targetTokens: 20000, maximumTokens: 30000 }
});
const ROLE_PROFILES = Object.freeze({
  resource_steward: { minimumStartTokens: 3000, targetTokens: 6000, maximumTokens: 12000 }
});

function whole(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function workerKind(worker = {}) {
  try {
    return require('./agents/workerKindService').resolveWorkerKind(worker.workerKind, worker.role);
  } catch (_) {
    return null;
  }
}

function applyMinimumOverride(profile, override, preserveProfileMinimum = false) {
  if (profile.maximumTokens === 0 || !Number.isFinite(Number(override))) return { ...profile };
  const minimumStartTokens = preserveProfileMinimum
    ? Math.max(profile.minimumStartTokens, whole(override)) : whole(override);
  const targetTokens = Math.max(minimumStartTokens, profile.targetTokens);
  return { minimumStartTokens, targetTokens,
    maximumTokens: Math.max(targetTokens, profile.maximumTokens) };
}

function profileWorker(worker, minimumOverride) {
  const kind = workerKind(worker);
  const role = String(worker?.role || '').trim().toLowerCase();
  const roleProfile = ROLE_PROFILES[role];
  const profile = applyMinimumOverride(roleProfile || PROFILES[kind] || DEFAULT_PROFILE,
    minimumOverride, Boolean(roleProfile));
  return { workerKind: kind, role: worker?.role || null, ...profile };
}

function profileWorkers(workers = [], minimumOverride) {
  return workers.map(worker => profileWorker(worker, minimumOverride));
}

function sumField(profiles, field) {
  return profiles.reduce((sum, profile) => sum + whole(profile[field]), 0);
}

function minimumOrchestratorReserve(totalTokens, workerCount) {
  return Math.min(whole(totalTokens), 4000 + (1000 * whole(workerCount)));
}

function targetOrchestratorReserve(totalTokens, workerCount) {
  const total = whole(totalTokens);
  const minimum = minimumOrchestratorReserve(total, workerCount);
  const target = minimum + Math.floor(total * 0.05);
  return Math.min(total, Math.max(minimum, Math.min(target, Math.floor(total * 0.3))));
}

function configuredShare(budget = {}) {
  const direct = budget.workerShare;
  const nested = budget.tokenPolicy?.workerShare;
  const reserve = budget.orchestratorReserve ?? budget.tokenPolicy?.orchestratorReserve;
  const raw = direct ?? nested ?? (reserve === undefined ? undefined : 1 - Number(reserve));
  if (raw === undefined || raw === null) return null;
  const share = Number(raw);
  return Number.isFinite(share) ? Math.max(0, Math.min(1, share)) : null;
}

function budgetEnvelope(totalTokens, profiles, budget = {}) {
  const total = whole(totalTokens);
  const minimumReserve = minimumOrchestratorReserve(total, profiles.length);
  const share = configuredShare(budget);
  const reserve = share === null
    ? targetOrchestratorReserve(total, profiles.length)
    : total - Math.floor(total * share);
  const valid = reserve >= minimumReserve;
  const workerPool = valid ? total - reserve : 0;
  return { total, workerPool, workerShare: total ? workerPool / total : 0,
    orchestratorReserve: total ? reserve / total : 1,
    orchestratorReserveTokens: reserve, minimumOrchestratorReserveTokens: minimumReserve,
    explicitWorkerShare: share !== null, valid,
    invalidReason: valid ? null : 'orchestrator_reserve_below_minimum' };
}

function minimumAcceptableTotal(profiles, budget = {}) {
  const required = sumField(profiles, 'minimumStartTokens');
  let low = required;
  let high = Math.max(1, required);
  const accepts = total => {
    const envelope = budgetEnvelope(total, profiles, budget);
    return envelope.valid && envelope.workerPool >= required;
  };
  while (!accepts(high) && high < 1_000_000_000) high *= 2;
  if (!accepts(high)) return null;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (accepts(middle)) high = middle;
    else low = middle + 1;
  }
  return low;
}

module.exports = {
  DEFAULT_PROFILE, PROFILES, profileWorker, profileWorkers, sumField,
  minimumOrchestratorReserve, targetOrchestratorReserve, budgetEnvelope,
  minimumAcceptableTotal
};
