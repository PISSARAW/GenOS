'use strict';

const relations = require('./crossAgentRelationalService');

const REPRODUCTIVE = new Set(['bonded_partner', 'partner']);
const CLOSE_KIN = new Set(['parent', 'child', 'sibling', 'twin', 'ancestor', 'descendant']);

function otherAgent(relation, agentId) {
  return relation.sourceAgentId === agentId ? relation.targetAgentId : relation.sourceAgentId;
}

function relationPriority(relation) {
  const type = relation.relationType === 'bonded_partner' ? 2 : 1;
  return type + Number(relation.metadata?.trustForDomain || 0);
}

async function pairRelations(db, input) {
  const all = await relations.listRelations({ db, agentId: input.parentA, ...input.scope });
  return all.filter((relation) => otherAgent(relation, input.parentA) === input.parentB);
}

async function assertCompatible(db, input) {
  const pair = await pairRelations(db, input);
  if (!input.allowRelatedParents && pair.some((relation) => CLOSE_KIN.has(relation.relationType))) {
    throw Object.assign(new Error('Close lineage relations cannot breed without an explicit override.'),
      { code: 'BREEDING_CLOSE_KIN_REJECTED' });
  }
  if (input.requirePartnerRelation && !pair.some((relation) => REPRODUCTIVE.has(relation.relationType))) {
    throw Object.assign(new Error('Breeding requires a partner or bonded_partner relation.'),
      { code: 'BREEDING_PARTNER_RELATION_REQUIRED' });
  }
  return pair;
}

async function selectPartner(db, input) {
  const all = await relations.listRelations({ db, agentId: input.parentA, ...input.scope });
  const ranked = all.filter((relation) => REPRODUCTIVE.has(relation.relationType))
    .sort((left, right) => relationPriority(right) - relationPriority(left));
  for (const relation of ranked) {
    const candidateId = otherAgent(relation, input.parentA);
    const candidate = await db.get(`SELECT id FROM agents WHERE id = ? AND workspace_id = ?
      AND status NOT IN ('terminated','apoptosis','error','failed','quarantined')`,
    candidateId, input.workspaceId);
    if (candidate) return candidate.id;
  }
  throw Object.assign(new Error('No eligible reproductive partner relation was found.'),
    { code: 'BREEDING_PARTNER_NOT_FOUND' });
}

module.exports = { assertCompatible, selectPartner };
