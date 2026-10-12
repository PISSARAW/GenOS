'use strict';

const { withTransaction } = require('../db');

function validAmount(value, name) {
  if (value == null) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new RangeError(`${name} must be finite and nonnegative.`);
  return amount;
}

function validTokens(value, name) {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a nonnegative integer.`);
  return value;
}

function budgetError(reason) {
  return Object.assign(new Error(reason), { code: 'MODEL_COST_BUDGET_EXCEEDED' });
}

function scopeOf(ctx) {
  return JSON.stringify([ctx.organizationId || null, ctx.projectId || null,
    ctx.budgetReservationId || ctx.routeActionId]);
}

function supportsReservation(db) {
  return Boolean(db && typeof db.exec === 'function' && typeof db.run === 'function'
    && typeof db.get === 'function');
}

function sameCeilings(row, quote) {
  return row.cost_ceiling_usd === quote.costCeilingUsd
    && row.token_ceiling === quote.tokenCeiling;
}

async function existingScope(db, scopeId) {
  return db.get(`SELECT COUNT(*) AS row_count, cost_ceiling_usd, token_ceiling,
    COALESCE(SUM(CASE WHEN status IN ('active', 'uncertain')
      THEN reserved_cost_usd ELSE actual_cost_usd END), 0) AS used_cost_usd,
    COALESCE(SUM(CASE WHEN status IN ('active', 'uncertain')
      THEN reserved_tokens ELSE actual_tokens END), 0) AS used_tokens
    FROM model_budget_reservations WHERE scope_id = ?`, scopeId);
}

function assertAdmission(used, quote) {
  if (used.row_count > 0 && !sameCeilings(used, quote)) {
    throw budgetError('Shared model budget scope has different ceilings.');
  }
  if (quote.costCeilingUsd !== null && used.used_cost_usd + quote.reservedCostUsd > quote.costCeilingUsd + 1e-12) {
    throw budgetError('Model cost reservation exceeds the remaining shared budget.');
  }
  if (quote.tokenCeiling !== null && used.used_tokens + quote.reservedTokens > quote.tokenCeiling) {
    throw budgetError('Model token reservation exceeds the remaining shared budget.');
  }
}

async function reserve(input) {
  const { db, attempt, ctx } = input;
  if (!supportsReservation(db)) return null;
  const quote = {
    costCeilingUsd: validAmount(ctx.maxCostUsd, 'maxCostUsd'),
    tokenCeiling: validTokens(ctx.budgetMaxTokens, 'budgetMaxTokens'),
    reservedCostUsd: validAmount(input.costUsd, 'reserved cost'),
    reservedTokens: validTokens(input.tokens, 'reserved tokens')
  };
  const scopeId = scopeOf(ctx);
  return withTransaction(db, async () => {
    const prior = await db.get('SELECT * FROM model_budget_reservations WHERE id = ?', attempt.id);
    if (prior) return { id: prior.id, scopeId, duplicate: true };
    const used = await existingScope(db, scopeId);
    assertAdmission(used, quote);
    await db.run(`INSERT INTO model_budget_reservations
      (id, scope_id, action_id, cost_ceiling_usd, token_ceiling,
       reserved_cost_usd, reserved_tokens, status, created_at)
      VALUES(?,?,?,?,?,?,?,?,?)`, attempt.id, scopeId, attempt.actionId,
    quote.costCeilingUsd, quote.tokenCeiling, quote.reservedCostUsd,
    quote.reservedTokens, 'active', new Date().toISOString());
    return { id: attempt.id, scopeId, reservedCostUsd: quote.reservedCostUsd,
      reservedTokens: quote.reservedTokens };
  });
}

function settlementOf(outcome) {
  if (!outcome.providerCalled) return { status: 'released', cost: 0, tokens: 0 };
  if (outcome.costUsd == null || outcome.tokens == null) return {
    status: 'uncertain', cost: null, tokens: null
  };
  return { status: 'settled', cost: validAmount(outcome.costUsd, 'actual cost'),
    tokens: validTokens(outcome.tokens, 'actual tokens') };
}

async function persistSettlement(db, row, settlement) {
  if (row.status !== 'active' && row.status !== 'uncertain') return;
  await db.run(`UPDATE model_budget_reservations SET status = ?, actual_cost_usd = ?,
    actual_tokens = ?, closed_at = ? WHERE id = ? AND status IN ('active', 'uncertain')`,
  settlement.status, settlement.cost, settlement.tokens,
  settlement.status === 'uncertain' ? null : new Date().toISOString(), row.id);
}

function exceedsScope(row, used) {
  return (row.cost_ceiling_usd !== null
    && used.used_cost_usd > row.cost_ceiling_usd + 1e-12)
    || (row.token_ceiling !== null && used.used_tokens > row.token_ceiling);
}

async function settle(db, reservation, outcome) {
  if (!reservation || !db || typeof db.get !== 'function') return { overBudget: false };
  const settlement = settlementOf(outcome);
  return withTransaction(db, async () => {
    const row = await db.get('SELECT * FROM model_budget_reservations WHERE id = ?', reservation.id);
    if (!row) throw new Error('Model budget reservation disappeared before settlement.');
    await persistSettlement(db, row, settlement);
    const used = await existingScope(db, row.scope_id);
    const current = await db.get('SELECT * FROM model_budget_reservations WHERE id = ?', row.id);
    return { overBudget: exceedsScope(row, used), status: current.status };
  });
}

module.exports = { reserve, settle };
