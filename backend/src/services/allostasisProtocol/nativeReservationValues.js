'use strict';

const { digest } = require('../evidenceProtocol/canonical');
const { amount } = require('./allocatorBindings');

const MAX_MICRO_USD = 1000000000000;

function usd(micro) {
  amount(micro);
  if (micro > MAX_MICRO_USD) throw new Error('ALLOSTASIS native micro_USD bridge exceeds its exact bounded range.');
  const result = micro / 1000000;
  if (Math.round(result * 1000000) !== micro) throw new Error('ALLOSTASIS native USD conversion fails exact roundtrip.');
  return result;
}

function quote(pool, retained) {
  amount(retained);
  const ceiling = pool.capacity - pool.protectedReserve - pool.baselineConsumed;
  return pool.query.unit === 'tokens' ? { costCeilingUsd: null, tokenCeiling: ceiling, costUsd: 0, tokens: retained }
    : { costCeilingUsd: usd(ceiling), tokenCeiling: null, costUsd: usd(retained), tokens: 0 };
}

function identities(pool, state) {
  const context = { organizationId: pool.query.scope.organizationId, projectId: pool.query.scope.projectId,
    budgetReservationId: `allostasis-pool:${digest(pool.query)}` };
  return { id: `allostasis-allocation:${state.allocation.allocationId}`, actionId: state.allocation.allocationId,
    scopeId: JSON.stringify([context.organizationId, context.projectId, context.budgetReservationId]), context };
}

function assertRow(row, expected) {
  if (!row || row.scope_id !== expected.scopeId || row.action_id !== expected.actionId
    || row.cost_ceiling_usd !== expected.quote.costCeilingUsd || row.token_ceiling !== expected.quote.tokenCeiling) {
    throw new Error('ALLOSTASIS native model reservation scope or ceilings conflict.');
  }
}

function outcome(pool, state, supplied) {
  const providerCalled = supplied.providerCalled !== false;
  if (!providerCalled && (state.spent !== 0 || state.unknownExposure !== 0 || state.held !== 0)) {
    throw new Error('ALLOSTASIS NOT_CALLED cannot erase consumed or exposed capacity.');
  }
  if (pool.query.unit === 'tokens') {
    return tokenOutcome(state, supplied, providerCalled);
  }
  return usdOutcome(state, supplied, providerCalled);
}

function tokenOutcome(state, supplied, providerCalled) {
  if (supplied.tokens != null && supplied.tokens !== state.spent) throw new Error('ALLOSTASIS native token settlement contradicts observed consumption.');
  return { providerCalled, tokens: state.spent, costUsd: supplied.costUsd ?? null };
}

function usdOutcome(state, supplied, providerCalled) {
  const costUsd = usd(state.spent);
  if (supplied.costUsd != null && supplied.costUsd !== costUsd) throw new Error('ALLOSTASIS native USD settlement contradicts observed consumption.');
  return { providerCalled, tokens: supplied.tokens ?? null, costUsd };
}

module.exports = { MAX_MICRO_USD, usd, quote, identities, assertRow, outcome };
