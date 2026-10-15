'use strict';

function whole(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function epochLimit(policy = {}, total, minimum) {
  const requested = Number(policy.maxEpochs);
  const budgetBound = Math.max(1, Math.floor(total / minimum));
  if (!Number.isFinite(requested)) return null;
  return Math.max(0, Math.min(budgetBound, Math.floor(requested)));
}

function createEpochBudget(pool, policy = {}, minimum = 1) {
  const total = whole(pool);
  const minimumTokens = Math.max(1, whole(minimum));
  return { schemaVersion: 1, total, remaining: total, minimum: minimumTokens,
    maxEpochs: epochLimit(policy, total, minimumTokens), reservedEpochs: 0, activeEpoch: null, history: [] };
}

function reserveEpoch(budget, workerCount) {
  const workers = whole(workerCount);
  if (budget.activeEpoch !== null) return blocked(budget, 'epoch_already_active');
  if (!workers) return blocked(budget, 'no_surviving_workers');
  if (budget.maxEpochs !== null && budget.reservedEpochs >= budget.maxEpochs) return blocked(budget, 'epoch_limit_reached');
  const affordableEpochs = Math.floor(budget.remaining / (budget.minimum * workers));
  if (!affordableEpochs) return blocked(budget, 'budget_below_minimum_tranche');
  const policyRoundsLeft = budget.maxEpochs === null ? affordableEpochs : budget.maxEpochs - budget.reservedEpochs;
  const roundsLeft = Math.min(affordableEpochs, policyRoundsLeft);
  const tranche = Math.floor(budget.remaining / roundsLeft);
  const perWorker = Math.floor(tranche / workers);
  if (perWorker < budget.minimum) return blocked(budget, 'budget_below_minimum_tranche');
  const reserved = perWorker * workers;
  const epoch = budget.reservedEpochs + 1;
  return { status: 'reserved', reason: null, epoch, perWorkerTokens: perWorker,
    workerTokens: Array(workers).fill(perWorker), reservedTokens: reserved,
    budget: { ...budget, remaining: budget.remaining - reserved, reservedEpochs: epoch, activeEpoch: epoch } };
}

function blocked(budget, reason) {
  return { status: 'stopped', reason, epoch: null, workerTokens: [], reservedTokens: 0, budget };
}

function settleEpoch(budget, epoch, outcome) {
  if (budget.activeEpoch !== epoch) return blocked(budget, 'epoch_identity_mismatch');
  return { ...budget, activeEpoch: null,
    history: [...budget.history, { epoch, outcome: String(outcome || 'unknown') }] };
}

function cancelEpochReservation(budget, reservation) {
  if (budget.activeEpoch !== reservation.epoch) return blocked(budget, 'epoch_identity_mismatch');
  return { ...budget, activeEpoch: null, remaining: budget.remaining + reservation.reservedTokens,
    reservedEpochs: budget.reservedEpochs - 1 };
}

module.exports = { createEpochBudget, reserveEpoch,
  settleEpoch, cancelEpochReservation };
