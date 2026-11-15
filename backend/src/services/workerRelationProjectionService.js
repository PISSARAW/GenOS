'use strict';

const relations = require('./crossAgentRelationalService');
const family = require('./familyHistoryService');

function eventType(edgeType) {
  return String(edgeType || '').includes('mutation') ? 'mutation' : 'birth';
}

async function workspaceScope(db, workspaceId) {
  const row = await db.get(
    'SELECT organization_id AS organizationId, project_id AS projectId FROM workspaces WHERE id = ?',
    workspaceId
  );
  return { organizationId: row?.organizationId || null, projectId: row?.projectId || null };
}

async function ensureRelation(db, input) {
  const id = relations.stableRelationId(input.relationType,
    `${input.sourceAgentId}:${input.targetAgentId}`);
  const existing = await relations.getRelation({ db, id });
  if (existing) return existing;
  return relations.createRelation({ ...input, db, id });
}

async function projectParents(db, input) {
  if (!input.parentIds.length) {
    await family.recordFamilyEvent(db, {
      id: relations.stableRelationId('birth', `${input.agentId}:root`),
      agentId: input.agentId, eventType: 'birth', narrative: 'Naissance de la lignée.',
      inheritedTraits: { parentIds: [], genes: input.genes || null }
    });
    return;
  }
  for (const parentId of input.parentIds) {
    await ensureRelation(db, { ...input.scope, sourceAgentId: parentId,
      targetAgentId: input.agentId, relationType: 'parent', relationClass: 'lineage' });
    await family.recordFamilyEvent(db, {
      id: relations.stableRelationId(input.eventType,
        `${parentId}:${input.agentId}:${input.edgeType || 'lineage'}`),
      agentId: input.agentId, parentId, eventType: input.eventType,
      narrative: input.eventType === 'mutation'
        ? `Mutation héritée de ${parentId}.` : `Naissance issue de ${parentId}.`,
      inheritedTraits: { parentIds: input.parentIds, genes: input.genes || null },
      mutationReason: input.eventType === 'mutation' ? JSON.stringify(input.mutations || []) : null
    });
  }
}

async function projectSiblings(db, input) {
  if (!input.parentIds.length) return;
  const marks = input.parentIds.map(() => '?').join(',');
  const rows = await db.all(`SELECT DISTINCT target_node_id AS agentId FROM lineage_edges
    WHERE source_node_id IN (${marks}) AND target_node_id <> ?`, [...input.parentIds, input.agentId]);
  for (const row of rows) {
    const pair = [input.agentId, row.agentId].sort();
    await ensureRelation(db, { ...input.scope, sourceAgentId: pair[0], targetAgentId: pair[1],
      relationType: 'sibling', relationClass: 'lineage' });
  }
}

async function projectSubordination(db, input) {
  const agent = await db.get('SELECT parent_agent_id AS parentId FROM agents WHERE id = ?', input.agentId);
  if (!agent?.parentId) return;
  await ensureRelation(db, { ...input.scope, sourceAgentId: agent.parentId,
    targetAgentId: input.agentId, relationType: 'manager', relationClass: 'organizational' });
  await ensureRelation(db, { ...input.scope, sourceAgentId: input.agentId,
    targetAgentId: agent.parentId, relationType: 'subordinate', relationClass: 'organizational' });
}

async function projectLineage(db, input) {
  const scope = await workspaceScope(db, input.workspaceId);
  const projection = { ...input, scope, eventType: eventType(input.edgeType) };
  await projectParents(db, projection);
  await projectSiblings(db, projection);
  await projectSubordination(db, projection);
  return { parentCount: input.parentIds.length, scope };
}

module.exports = { projectLineage, workspaceScope };
