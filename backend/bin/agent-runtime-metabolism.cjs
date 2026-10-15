'use strict';

async function persist(ctx) {
  try {
    await require('../src/services/metabolicLedgerRuntimeBridge').recordRuntimeUsage(ctx.db, ctx);
  } catch (error) {
    ctx.emit({ eventType: 'METABOLIC_LEDGER_WRITE_FAILED', action: 'OBSERVABILITY',
      detail: `Runtime metabolic observation could not be persisted: ${error.message}`,
      severity: 'warning', payload: { missionId: ctx.mission?.missionId || null } });
  }
}

module.exports = { persist };
