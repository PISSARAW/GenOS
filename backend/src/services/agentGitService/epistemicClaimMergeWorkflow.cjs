'use strict';

async function replaceEpistemicClaims(context) {
for (const row of context.claims) {
    const existing = await context.db.get('SELECT producer_agent_id FROM epistemic_claims WHERE id = ?', row.id);
    if (existing && existing.producer_agent_id !== context.targetAgentId) throw new context.Error('Epistemic claim ID belongs to another producer.');
    await context.upsertClaim(context.db, row);
  }
}

module.exports = { replaceEpistemicClaims };
