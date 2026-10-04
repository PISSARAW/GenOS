'use strict';

const risk = require('./riskLedgerService');

async function evaluate(db, contract) {
  if (!contract) return { allowed: true, applied: false };
  try {
    const result = await risk.finalizeTest(db, contract);
    return { allowed: result.eligible, applied: true, result,
      reason: result.eligible ? null : 'STATISTICAL_THRESHOLD_NOT_MET' };
  } catch (error) {
    return { allowed: false, applied: true, reason: error.message };
  }
}

module.exports = { evaluate };
