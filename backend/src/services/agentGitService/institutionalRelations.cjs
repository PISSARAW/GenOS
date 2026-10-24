'use strict';

const COLUMNS = ['id', 'source_agent_id', 'target_agent_id', 'relation_type', 'familiarity',
  'interaction_count', 'shared_history', 'authority', 'trust_for_domain',
  'common_ground_estimate', 'epistemic_independence', 'error_correlation',
  'disclosure_level', 'preferred_dialect', 'last_interaction', 'organization_id',
  'project_id', 'provenance_hash', 'relation_class', 'metadata_json', 'updated_at'];

async function collectRelations(db, req, agentId) {
  const scope = req.tenant ? `AND w.organization_id = ? AND w.project_id = ?
    AND (r.organization_id IS NULL OR r.organization_id = ?)
    AND (r.project_id IS NULL OR r.project_id = ?)` : '';
  const tenant = req.tenant;
  const args = tenant ? [agentId, agentId, agentId, tenant.organizationId, tenant.projectId,
    tenant.organizationId, tenant.projectId] : [agentId, agentId, agentId];
  return db.all(`SELECT r.* FROM agent_relations r JOIN agents peer ON peer.id =
    CASE WHEN r.source_agent_id = ? THEN r.target_agent_id ELSE r.source_agent_id END
    JOIN workspaces w ON w.id = peer.workspace_id
    WHERE (r.source_agent_id = ? OR r.target_agent_id = ?) ${scope} ORDER BY r.id`, ...args);
}

function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

function mergeRelations(ctx) {
  const base = new Map((ctx.base || []).map((row) => [row.id, row]));
  const left = new Map((ctx.left || []).map((row) => [row.id, row]));
  const right = new Map((ctx.right || []).map((row) => [row.id, row]));
  const merged = [];
  const conflicts = [];
  for (const id of new Set([...base.keys(), ...left.keys(), ...right.keys()])) {
    const original = base.get(id);
    const a = left.get(id);
    const b = right.get(id);
    const aChanged = !same(original, a);
    const bChanged = !same(original, b);
    if (aChanged && bChanged && !same(a, b)) {
      conflicts.push({ section: 'relations', id, reason: 'divergent_institutional_relation' });
      continue;
    }
    const selected = bChanged ? b : a;
    if (!selected) continue;
    if (Number(selected.authority || 0) > Number(original?.authority || 0)
        || original && selected.relation_type !== original.relation_type) {
      conflicts.push({ section: 'relations', id, reason: 'authority_change_requires_review' });
    } else merged.push(selected);
  }
  return { merged, conflicts };
}

async function assertRelation(ctx, relation) {
  const { db, req, agentId } = ctx;
  if (!relation.id || ![relation.source_agent_id, relation.target_agent_id].includes(agentId)) {
    throw new Error('Relation does not belong to the target agent.');
  }
  if (!Number.isFinite(Number(relation.authority)) || Number(relation.authority) < 0
      || Number(relation.authority) > 1) throw new Error('Relation authority is outside [0,1].');
  const peerId = relation.source_agent_id === agentId ? relation.target_agent_id : relation.source_agent_id;
  const scope = req.tenant ? 'AND w.organization_id = ? AND w.project_id = ?' : '';
  const args = req.tenant ? [peerId, req.tenant.organizationId, req.tenant.projectId] : [peerId];
  const peer = await db.get(`SELECT a.id FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ? ${scope}`, ...args);
  if (!peer || peerId === agentId) throw new Error('Relation peer is unavailable in the target scope.');
  if (req.tenant && (relation.organization_id && relation.organization_id !== req.tenant.organizationId
      || relation.project_id && relation.project_id !== req.tenant.projectId)) {
    throw new Error('Relation tenant metadata is outside the target scope.');
  }
}

async function replaceRelations(ctx, rows) {
  if (!Array.isArray(rows)) return;
  const { db, req, targetAgentId } = ctx;
  const current = await db.all('SELECT * FROM agent_relations WHERE source_agent_id = ? OR target_agent_id = ?',
    targetAgentId, targetAgentId);
  const previous = new Map(current.map((row) => [row.id, row]));
  for (const relation of rows) {
    await assertRelation({ db, req, agentId: targetAgentId }, relation);
    const old = previous.get(relation.id);
    if (Number(relation.authority || 0) > Number(old?.authority || 0)
        || old && relation.relation_type !== old.relation_type) {
      throw new Error('Relation authority change requires an institutional review.');
    }
  }
  const tenantClause = req.tenant
    ? 'AND (organization_id IS NULL OR organization_id = ?) AND (project_id IS NULL OR project_id = ?)' : '';
  const scopeArgs = req.tenant ? [req.tenant.organizationId, req.tenant.projectId] : [];
  await db.run(`DELETE FROM agent_relations WHERE (source_agent_id = ? OR target_agent_id = ?) ${tenantClause}`,
    targetAgentId, targetAgentId, ...scopeArgs);
  const sql = `INSERT INTO agent_relations (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map(() => '?').join(', ')})`;
  for (const relation of rows) await db.run(sql, ...COLUMNS.map((column) =>
    column === 'metadata_json' ? relation[column] || '{}' : relation[column] ?? null));
}

module.exports = { collectRelations, mergeRelations, replaceRelations };
