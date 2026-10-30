'use strict';

async function replaceClaimsStage1(__genosStageScope1) {
for (const row of __genosStageScope1.claims) {
    const existing = await __genosStageScope1.db.get('SELECT producer_agent_id FROM epistemic_claims WHERE id = ?', row.id);
    if (existing && existing.producer_agent_id !== __genosStageScope1.targetAgentId) throw new __genosStageScope1.Error('Epistemic claim ID belongs to another producer.');
    await (0, __genosStageScope1.upsertClaim)(__genosStageScope1.db, row);
  }
}

module.exports = { replaceClaimsStage1 };
