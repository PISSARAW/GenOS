'use strict';

const DEFAULTS = Object.freeze({ wakeThreshold: 0.35, maxTransfers: 2, maxSpawns: 2 });
const HARD_ACTION_LIMIT = 5;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function bounded(value, low, high) {
  return Math.max(low, Math.min(high, finite(value, low)));
}

function normalizeBid(group, bid) {
  const requested = Math.max(0, Math.floor(finite(bid.requestedTokens)));
  const minimum = Math.max(0, Math.min(requested, Math.floor(finite(bid.minimumTokens, requested))));
  const value = bounded(bid.marginalValue, 0, 1) * bounded(bid.confidence, 0, 1);
  return {
    groupId: String(group.id), bidId: String(bid.id), requestedTokens: requested,
    minimumTokens: minimum, marginalValue: value, density: requested ? value / requested : 0,
    evidenceRefs: Array.isArray(bid.evidenceRefs) ? bid.evidenceRefs.filter(Boolean).map(String) : [],
    workerKind: bid.workerKind ? String(bid.workerKind) : null,
    workerCount: Math.max(0, Math.floor(finite(bid.workerCount, 1))),
    governance: bid.governance ? String(bid.governance) : null
  };
}

function compareBids(left, right) {
  return right.density - left.density
    || right.marginalValue - left.marginalValue
    || left.groupId.localeCompare(right.groupId)
    || left.bidId.localeCompare(right.bidId);
}

function allocationFor(bid, available) {
  if (!bid.requestedTokens || available < bid.minimumTokens) return 0;
  return Math.min(bid.requestedTokens, available);
}

function allocateBids(bids, budget) {
  let remaining = budget;
  const allocations = [];
  for (const bid of bids.slice().sort(compareBids)) {
    const tokens = allocationFor(bid, remaining);
    remaining -= tokens;
    allocations.push({ ...bid, allocatedTokens: tokens,
      allocatedMarginalValue: bid.requestedTokens ? bid.marginalValue * tokens / bid.requestedTokens : 0,
      status: tokens ? (tokens === bid.requestedTokens ? 'funded' : 'partial') : 'deferred' });
  }
  return { allocations, remaining };
}

function validWakeSignal(group, threshold) {
  const signal = group.wakeSignal || {};
  return Array.isArray(signal.evidenceRefs) && signal.evidenceRefs.some(Boolean)
    && bounded(signal.marginalValue, 0, 1) >= threshold;
}

function groupStates(groups, threshold) {
  return new Map(groups.map((group) => {
    const wasSleeping = group.state === 'sleeping';
    const wake = wasSleeping && validWakeSignal(group, threshold);
    return [String(group.id), { state: wasSleeping && !wake ? 'sleeping' : 'active',
      reason: wake ? 'qualified_new_evidence' : wasSleeping ? 'wake_signal_below_threshold' : null }];
  }));
}

function liveBids(groups, states) {
  return groups.flatMap((group) => states.get(String(group.id)).state === 'active'
    ? (Array.isArray(group.needs) ? group.needs : []).map((bid) => normalizeBid(group, bid))
      .filter((bid) => bid.evidenceRefs.length > 0) : []);
}

function transferableWorkers(input, groupId, kind) {
  return (Array.isArray(input.availableWorkers) ? input.availableWorkers : [])
    .filter((worker) => worker.workerKind === kind && worker.transferable === true
      && worker.groupId !== groupId).sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function staffingActions(input, allocation, limits) {
  if (!allocation.allocatedTokens || !allocation.workerKind || !allocation.workerCount) return [];
  const needed = Math.min(allocation.workerCount, limits.maxTransfers + limits.maxSpawns);
  const workers = transferableWorkers(input, allocation.groupId, allocation.workerKind)
    .slice(0, Math.min(needed, limits.maxTransfers));
  const actions = workers.map((worker) => ({ type: 'transfer', workerId: String(worker.id),
    fromGroupId: String(worker.groupId), toGroupId: allocation.groupId, status: 'proposed' }));
  let missing = needed - workers.length;
  const spawned = Math.max(0, Math.floor(finite(input.spawnedCount)));
  const spawnCount = Math.min(missing, limits.maxSpawns, Math.max(0, limits.maxSpawns - spawned));
  for (let index = 0; index < spawnCount; index += 1) actions.push({ type: 'spawn', workerKind: allocation.workerKind,
    toGroupId: allocation.groupId, status: input.spawnAuthority === true ? 'authorized_proposal' : 'pending_authority' });
  missing -= spawnCount;
  if (missing) actions.push({ type: 'staffing', workerKind: allocation.workerKind,
    toGroupId: allocation.groupId, count: missing, status: 'pending_capacity_or_authority' });
  return actions;
}

function governanceAction(group, allocation, authority) {
  if (!allocation.allocatedTokens || !allocation.governance || allocation.governance === group.governance) return null;
  const authorized = authority === true || (Array.isArray(authority) && authority.includes(group.id));
  return { type: 'regovernance', groupId: allocation.groupId, from: group.governance || null,
    to: allocation.governance, status: authorized ? 'authorized_proposal' : 'pending_authority' };
}

function actionsFor(input, allocations, limits) {
  const byId = new Map(input.groups.map((group) => [String(group.id), group]));
  const actions = [];
  const usedWorkers = new Set();
  let transfers = 0;
  let spawns = 0;
  for (const entry of allocations) {
    const remaining = { maxTransfers: Math.max(0, limits.maxTransfers - transfers),
      maxSpawns: Math.max(0, limits.maxSpawns - spawns) };
    const availableInput = { ...input, availableWorkers: (input.availableWorkers || [])
      .filter((worker) => !usedWorkers.has(String(worker.id))) };
    const staffing = staffingActions(availableInput, entry, remaining);
    actions.push(...staffing);
    staffing.filter((action) => action.type === 'transfer').forEach((action) => usedWorkers.add(action.workerId));
    transfers += staffing.filter((action) => action.type === 'transfer').length;
    spawns += staffing.filter((action) => action.type === 'spawn').length;
    const change = governanceAction(byId.get(entry.groupId), entry, input.governanceAuthority);
    if (change) actions.push(change);
  }
  return actions;
}

function updateStates(states, allocations) {
  const funded = new Set(allocations.filter((entry) => entry.allocatedTokens > 0).map((entry) => entry.groupId));
  for (const [groupId, state] of states) {
    if (state.state === 'active' && !funded.has(groupId)) {
      states.set(groupId, { state: 'sleeping', reason: 'no_fundable_need' });
    }
  }
  return Array.from(states, ([groupId, state]) => ({ groupId, ...state }));
}

function arbitrateGroupNeeds(input) {
  if (!input || !Array.isArray(input.groups)) throw new TypeError('groups must be an array');
  const policy = { ...DEFAULTS, ...(input.policy || {}) };
  const budget = Math.max(0, Math.floor(finite(input.budget)));
  const states = groupStates(input.groups, bounded(policy.wakeThreshold, 0, 1));
  const result = allocateBids(liveBids(input.groups, states), budget);
  const limits = { maxTransfers: Math.floor(bounded(policy.maxTransfers, 0, HARD_ACTION_LIMIT)),
    maxSpawns: Math.floor(bounded(policy.maxSpawns, 0, HARD_ACTION_LIMIT)) };
  return {
    schemaVersion: 1, budget, allocatedTokens: budget - result.remaining,
    unallocatedTokens: result.remaining, allocations: result.allocations,
    groupStates: updateStates(states, result.allocations),
    actions: actionsFor(input, result.allocations, limits)
  };
}

module.exports = { arbitrateGroupNeeds };
