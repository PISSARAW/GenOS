'use strict';

const { randomUUID } = require('node:crypto');
const persistence = require('./agowStatePersistenceService');
const policies = require('./agowMechanismPolicyService');
const ACTIVE = new Set(['shadow', 'advisory', 'bounded', 'live']);

async function CONSOLIDATE(input) {
  const policy = await policies.load({ agentId: input.frame.agentId, db: input.db });
  if (!ACTIVE.has(policy.proceduralization)) return { executed: false, reason: 'proceduralization_disabled' };
  const result = await require('./proceduralization/consciousnessCompilerService').compile({
    agentId: input.frame.agentId, db: input.db });
  if (!result.proposed) return { executed: true, ...result };
  const proposal = { ...result, proposalId: randomUUID(), frameId: input.frame.frameId, createdAt: Date.now() };
  await persistence.update({ scope: 'agow_procedural_proposals', agentId: input.frame.agentId,
    db: input.db }, (state) => ({ proposals: [...(state.proposals || []), proposal].slice(-100) }));
  return { executed: true, proposal, promotionRequested: false };
}

async function REORGANIZE(input) {
  const policy = await policies.load({ agentId: input.frame.agentId, db: input.db });
  if (!ACTIVE.has(policy.markets)) return { executed: false, reason: 'markets_disabled' };
  const partitionByModule = Object.fromEntries(input.candidates.map((candidate) =>
    [candidate.source.module, `region:${candidate.source.module}`]));
  const result = await require('./markets/morphogenesisMarketAdapter').recordProposal({
    agentId: input.frame.agentId, db: input.db, proposal: {
      proposalId: randomUUID(), topology: 'domain', marketStructure: { partitionByModule },
      evidenceRefs: input.candidates.flatMap((candidate) => candidate.evidenceRefs)
    }
  });
  return { executed: result.accepted, ...result, activated: false };
}

module.exports = { CONSOLIDATE, REORGANIZE };
