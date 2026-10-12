'use strict';

const { randomUUID } = require('node:crypto');
const scopes = require('./subprocessModelBudgetRoute');
const reservations = require('./modelBudgetReservationService');

function invalid(message) {
  return Object.assign(new Error(message), { code: 'MISSION_MODEL_BUDGET_SCOPE_INVALID' });
}

function nonnegativeCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function measured(usage) {
  const input = usage?.input_tokens ?? usage?.prompt_tokens ?? usage?.inputTokens;
  const output = usage?.output_tokens ?? usage?.completion_tokens ?? usage?.outputTokens;
  const cost = usage?.cost_usd ?? usage?.costUsd ?? usage?.cost;
  if (![input, output].every(nonnegativeCount)
    || !Number.isFinite(cost) || cost < 0) return null;
  return { tokens: input + output, costUsd: cost };
}

function inputTokens(request) {
  return Math.ceil(Buffer.byteLength(JSON.stringify(request.messages || []), 'utf8') / 4);
}

function outputTokens(request) {
  const value = request.max_tokens ?? request.maxTokens;
  if (!Number.isSafeInteger(value) || value <= 0) throw invalid('External model output budget is missing.');
  return value;
}

async function openForState(state) {
  if (!state.mission.modelBudgetScopeJson) return null;
  return scopes.openForMission(state.mission, state.executionBudget);
}

function childRemaining(state) {
  const budget = state.executionBudget;
  const tokens = budget.tokens - (state.sharedModelUsage?.tokens || 0);
  const costUsd = budget.costUsd - (state.sharedModelUsage?.costUsd || 0);
  if (!Number.isSafeInteger(tokens) || tokens <= 0 || !Number.isFinite(costUsd) || costUsd < 0) {
    throw invalid('External model child budget is exhausted.');
  }
  return { tokens, costUsd };
}

function boundedRequest(state, request) {
  const remaining = childRemaining(state);
  const available = remaining.tokens - inputTokens(request);
  if (available <= 0) throw invalid('External model request exceeds child token ceiling.');
  const key = request.max_tokens === undefined ? 'maxTokens' : 'max_tokens';
  return { ...request, [key]: Math.min(outputTokens(request), available) };
}

async function reserve(state, request) {
  const remaining = childRemaining(state);
  const tokens = inputTokens(request) + outputTokens(request);
  const id = `external-model:${randomUUID()}`;
  return reservations.reserve({ db: state.modelBudgetRoute.db,
    attempt: { id, actionId: id }, ctx: state.modelBudgetRoute,
    costUsd: remaining.costUsd, tokens });
}

async function sample(state, request, invoke) {
  if (!state.modelBudgetRoute) return invoke(request);
  const bounded = boundedRequest(state, request);
  const reservation = await reserve(state, bounded);
  let response;
  try {
    response = await invoke(bounded);
  } catch (error) {
    await reservations.settle(state.modelBudgetRoute.db, reservation, {
      providerCalled: true, costUsd: null, tokens: null });
    throw error;
  }
  const usage = measured(response?.usage);
  const settlement = await reservations.settle(state.modelBudgetRoute.db, reservation, {
    providerCalled: true, costUsd: usage?.costUsd ?? null, tokens: usage?.tokens ?? null });
  if (!usage) throw invalid('External model response lacks measured tokens and cost.');
  state.sharedModelUsage ||= { tokens: 0, costUsd: 0 };
  state.sharedModelUsage.tokens += usage.tokens;
  state.sharedModelUsage.costUsd += usage.costUsd;
  if (settlement.overBudget || state.sharedModelUsage.tokens > state.executionBudget.tokens
    || state.sharedModelUsage.costUsd > state.executionBudget.costUsd) {
    throw invalid('External model response exceeded the shared model budget.');
  }
  return response;
}

module.exports = { openForState, sample, close: scopes.close };
