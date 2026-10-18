'use strict';

const SCHEMA = 'genos.chargeback/v1';
const STATUSES = Object.freeze(['open', 'settled', 'disputed', 'closed']);

function buildChargeback(input = {}) {
  const chargeback = {
    schema: SCHEMA,
    chargeback_id: input.chargebackId || null,
    mission_id: input.missionId || null,
    run_id: input.runId || null,
    worker_id: input.workerId || null,
    tenant_id: input.tenantId || null,
    budget_scope: input.budgetScope || 'mission',
    currency: input.currency || 'USD',
    lineItems: input.lineItems || [],
    total_amount_usd: 0,
    status: 'open',
    version: 1,
    settled_at: null,
    receipt: null
  };
  return validateChargeback(chargeback);
}

function validateChargeback(chargeback) {
  if (!chargeback || chargeback.schema !== SCHEMA) {
    throw new Error(`chargeback.schema must be ${SCHEMA}`);
  }
  if (!STATUSES.includes(chargeback.status)) {
    throw new Error(`chargeback.status must be one of ${JSON.stringify(STATUSES)}`);
  }
  if (!Array.isArray(chargeback.lineItems)) {
    throw new Error('chargeback.lineItems must be an array');
  }
  if (typeof chargeback.total_amount_usd !== 'number' || !Number.isFinite(chargeback.total_amount_usd)) {
    throw new Error('chargeback.total_amount_usd must be a finite number');
  }
  return chargeback;
}

function addLineItem(chargeback, item = {}) {
  const lineItem = {
    id: item.id || null,
    description: item.description || '',
    amount_usd: Number(item.amountUsd || 0),
    category: item.category || 'execution',
    reference_id: item.referenceId || null,
    reference_type: item.referenceType || 'run',
    timestamp: item.timestamp || new Date().toISOString()
  };
  if (lineItem.amount_usd < 0) {
    throw new Error('chargeback line item amount_usd must be non-negative');
  }
  const next = { ...chargeback };
  next.lineItems = [...chargeback.lineItems, lineItem];
  next.total_amount_usd = round2(next.lineItems.reduce((sum, li) => sum + li.amount_usd, 0));
  return validateChargeback(next);
}

function settleChargeback(chargeback, settledAt = null) {
  if (chargeback.status !== 'open') {
    throw new Error('only open chargebacks can be settled');
  }
  return {
    ...chargeback,
    status: 'settled',
    settled_at: settledAt || new Date().toISOString()
  };
}

function disputeChargeback(chargeback, reason) {
  if (chargeback.status === 'closed') {
    throw new Error('closed chargebacks cannot be disputed');
  }
  return { ...chargeback, status: 'disputed', dispute_reason: reason };
}

function closeChargeback(chargeback) {
  if (chargeback.status === 'closed') {
    throw new Error('chargeback already closed');
  }
  return { ...chargeback, status: 'closed' };
}

function aggregateChargebacks(chargebacks = []) {
  let total = 0;
  const byCategory = {};
  const byMission = {};
  for (const cb of chargebacks) {
    total += cb.total_amount_usd || 0;
    for (const li of cb.lineItems || []) {
      byCategory[li.category] = (byCategory[li.category] || 0) + li.amount_usd;
    }
    byMission[cb.missionId || 'unknown'] = (byMission[cb.missionId || 'unknown'] || 0) + (cb.total_amount_usd || 0);
  }
  return {
    total_amount_usd: round2(total),
    chargeback_count: chargebacks.length,
    by_category: byCategory,
    by_mission: byMission
  };
}

function buildReceipt(chargeback) {
  if (chargeback.status !== 'settled') {
    throw new Error('chargeback receipt requires a settled chargeback');
  }
  return {
    schema: 'genos.chargeback-receipt/v1',
    chargeback_id: chargeback.chargeback_id,
    mission_id: chargeback.mission_id,
    run_id: chargeback.run_id,
    worker_id: chargeback.worker_id,
    total_amount_usd: chargeback.total_amount_usd,
    currency: chargeback.currency,
    settled_at: chargeback.settled_at,
    line_item_count: chargeback.lineItems.length,
    valid: true
  };
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

module.exports = {
  SCHEMA,
  STATUSES,
  buildChargeback,
  validateChargeback,
  addLineItem,
  settleChargeback,
  disputeChargeback,
  closeChargeback,
  aggregateChargebacks,
  buildReceipt,
  round2
};
