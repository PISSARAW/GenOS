'use strict';

async function arm(ctx, habitat) {
  const receipt = await require('./habitatEnforcementService')
    .armProcessWallClock(ctx, habitat);
  if (!receipt) return null;
  try {
    require('./agentOrchestrationState').emit(ctx.agentId,
      'HABITAT_ENFORCEMENT_ARMED', 'HABITAT',
      'The backend armed the wall-clock guarantee for the bound habitat revision.', {
        receiptId: receipt.id, receiptHash: receipt.receiptHash,
        habitatHash: receipt.habitatHash, wallClockMs: receipt.limitValue
      }, 'info', 'running');
  } catch (error) {
    console.error('[HabitatEnforcement] Receipt event emission failed:', error.message);
  }
  return receipt;
}

module.exports = { arm };
