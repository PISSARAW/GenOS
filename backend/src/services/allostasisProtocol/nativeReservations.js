'use strict';

const native = require('../modelBudgetReservationService');
const values = require('./nativeReservationValues');

function applicable(pool) { return ['tokens', 'micro_USD'].includes(pool.query.unit); }

class NativeReservations {
  constructor(db) { this.db = db; }

  async row(pool, state) {
    const identity = values.identities(pool, state);
    const quote = values.quote(pool, 0);
    const row = await this.db.get('SELECT * FROM model_budget_reservations WHERE id = ?', identity.id);
    values.assertRow(row, { ...identity, quote });
    return { identity, quote, row };
  }

  async reserve(pool, state) {
    if (!applicable(pool)) return null;
    const identity = values.identities(pool, state);
    const quote = values.quote(pool, state.allocation.amount);
    const result = await native.reserve({ db: this.db, attempt: { id: identity.id, actionId: identity.actionId },
      ctx: { ...identity.context, reservationCostCeilingUsd: quote.costCeilingUsd, budgetMaxTokens: quote.tokenCeiling },
      costUsd: quote.costUsd, tokens: quote.tokens });
    const { row } = await this.row(pool, state);
    if (!result || result.duplicate || row.status !== 'active' || row.reserved_tokens !== quote.tokens || row.reserved_cost_usd !== quote.costUsd) {
      throw new Error('ALLOSTASIS native reservation has a conflicting existing state.');
    }
    return { id: identity.id, scopeId: identity.scopeId, unit: pool.query.unit };
  }

  async syncHeld(pool, state) {
    if (!applicable(pool)) return null;
    const { identity, row } = await this.row(pool, state);
    const retained = state.spent + state.held;
    if (!Number.isSafeInteger(retained) || (pool.query.unit === 'micro_USD' && retained > values.MAX_MICRO_USD)) {
      return { status: 'bridge_unavailable', reason: 'actual_outside_exact_native_range' };
    }
    const quote = values.quote(pool, retained);
    if (!['active', 'uncertain'].includes(row.status)) {
      const actual = pool.query.unit === 'tokens' ? row.actual_tokens : row.actual_cost_usd;
      const expected = pool.query.unit === 'tokens' ? state.spent : values.usd(state.spent);
      if (state.held !== 0 || actual !== expected) throw new Error('ALLOSTASIS native terminal reservation cannot be reopened or rewritten.');
      return { status: row.status };
    }
    const changed = await this.db.run(`UPDATE model_budget_reservations SET reserved_tokens = ?,reserved_cost_usd = ?
      WHERE id = ? AND status = ? AND reserved_tokens = ? AND reserved_cost_usd = ?`,
    quote.tokens, quote.costUsd, identity.id, row.status, row.reserved_tokens, row.reserved_cost_usd);
    if (changed.changes !== 1) throw new Error('ALLOSTASIS native reservation retention CAS rejected.');
    return { status: row.status, retained: state.spent + state.held };
  }

  async settle(pool, state, supplied = {}) {
    if (!applicable(pool)) return null;
    if (state.held !== 0 || state.unknownExposure !== 0) throw new Error('ALLOSTASIS native settlement cannot release unclosed exposure.');
    const retained = await this.syncHeld(pool, state);
    if (retained?.status === 'bridge_unavailable') return retained;
    const { identity } = await this.row(pool, state);
    return native.settle(this.db, { id: identity.id }, values.outcome(pool, state, supplied));
  }
}

module.exports = { NativeReservations, applicable };
