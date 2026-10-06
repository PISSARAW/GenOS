const { decodeEmbeddingBlob } = require('./decodeEmbeddingBlob.js');

function buildSynapseClauses(tenant) {
  const ownerClause = tenant.ownerId ? ' AND gd.created_by = ?' : '';
  const orgClause = tenant.organizationId ? ' AND (gd.organization_id = ? OR gd.organization_id IS NULL)' : '';
  const synapseOrgClause = tenant.organizationId ? ' AND (ms.organization_id = ? OR ms.organization_id IS NULL)' : '';
  const synapseProjectClause = tenant.projectId ? ' AND (ms.project_id = ? OR ms.project_id IS NULL)' : '';
  return { ownerClause, orgClause, synapseOrgClause, synapseProjectClause };
}

function buildSynapseQueryParams(params) {
  const { topIds, tenant } = params;
  const out = [...topIds];
  if (tenant.ownerId) out.push(tenant.ownerId);
  if (tenant.organizationId) out.push(tenant.organizationId);
  if (tenant.projectId) out.push(tenant.projectId);
  if (tenant.organizationId) out.push(tenant.organizationId);
  return out;
}

function extractSynapseResults(params) {
  const { synapses, topIds } = params;
  const linkedIds = [];
  const synapseWeightById = new Map();
  for (const s of synapses) {
    if (!topIds.includes(s.id)) {
      linkedIds.push(s.id);
      if (!synapseWeightById.has(s.id) || s.weight > synapseWeightById.get(s.id)) {
        synapseWeightById.set(s.id, s.weight);
      }
    }
  }
  return { uniqueLinkedIds: [...new Set(linkedIds)], synapseWeightById };
}

function buildDecisionQuery(params) {
  const { uniqueLinkedIds, ownerId, tenant } = params;
  const placeholders = uniqueLinkedIds.map(() => '?').join(',');
  let query = `SELECT id, title, category, content, created_by, created_at, synaptic_weight, embedding_blob FROM genome_decisions WHERE id IN (${placeholders})`;
  if (ownerId) query += ' AND created_by = ?';
  if (tenant.organizationId) query += ' AND (organization_id = ? OR organization_id IS NULL)';
  if (tenant.projectId) query += ' AND (project_id = ? OR project_id IS NULL)';
  const queryParams = [...uniqueLinkedIds];
  if (ownerId) queryParams.push(ownerId);
  if (tenant.organizationId) queryParams.push(tenant.organizationId);
  if (tenant.projectId) queryParams.push(tenant.projectId);
  return { query, params: queryParams };
}

function mapDecisionToResult(params) {
  const { item, edgeWeight } = params;
  const normalizedEdge = Math.min(2.5, Math.max(0.1, edgeWeight));
  const score = Number(((item.synaptic_weight || 1.0) * 0.4 * normalizedEdge).toFixed(4));
  return {
    id: item.id, title: item.title, category: item.category,
    status: item.category === 'Failure' ? 'FAILURE' : 'SUCCESS',
    summary: item.content, tags: ['genome', item.category, 'graph_association'],
    author: item.created_by, createdAt: item.created_at,
    vector: decodeEmbeddingBlob(item.embedding_blob),
    synaptic_weight: item.synaptic_weight || 1.0,
    similarityScore: score, cosineMetric: 0.5, synaptic_edge_weight: Number(edgeWeight.toFixed(4))
  };
}

async function traverseSynapses(params) {
  const { topIds = [], db = null, ownerId = '', tenant = {} } = params;
  if (!db || !topIds.length) return [];
  const placeholders = topIds.map(() => '?').join(',');
  const { ownerClause, orgClause, synapseOrgClause, synapseProjectClause } = buildSynapseClauses({ ownerId, ...tenant });
  const queryParams = buildSynapseQueryParams({ topIds, tenant: { ownerId, ...tenant } });
  try {
    const synapses = await db.all(`
      WITH RECURSIVE
        traverse(id, depth, weight) AS (
          SELECT id, 0, 1.0 FROM genome_decisions gd WHERE id IN (${placeholders})${ownerClause}${orgClause}
          UNION
          SELECT
            CASE WHEN ms.source_id = t.id THEN ms.target_id ELSE ms.source_id END,
            t.depth + 1,
            t.weight * (MIN(2.0, ms.weight) / 2.0)
          FROM traverse t
          JOIN memory_synapses ms ON (ms.source_id = t.id OR ms.target_id = t.id)${synapseOrgClause}${synapseProjectClause}
          WHERE t.depth < 2 AND ms.weight > 0 AND (ms.transmitter_type IS NULL OR ms.transmitter_type != 'gaba')
        )
      SELECT id, depth, weight FROM traverse WHERE depth > 0
      ORDER BY weight DESC, depth ASC LIMIT 15
    `, queryParams);
    const { uniqueLinkedIds, synapseWeightById } = extractSynapseResults({ synapses, topIds });
    if (!uniqueLinkedIds.length) return [];
    const { query, params: decisionParams } = buildDecisionQuery({ uniqueLinkedIds, ownerId, tenant });
    const connectedDecisions = await db.all(query, decisionParams);
    return connectedDecisions.map(item => mapDecisionToResult({ item, edgeWeight: synapseWeightById.get(item.id) ?? 1.0 }));
  } catch { return []; }
}

module.exports = { traverseSynapses, buildSynapseClauses, buildSynapseQueryParams, extractSynapseResults, buildDecisionQuery, mapDecisionToResult };