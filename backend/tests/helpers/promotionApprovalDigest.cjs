'use strict';

async function digestFor(db, runId, report) {
  const row = await db.get('SELECT * FROM strategy_execution_runs WHERE id = ?', runId);
  const context = await require('../../src/services/strategyPromotionGate').loadPromotionContext(db, row, { report });
  return context.approvalDigest;
}

module.exports = { digestFor };
