'use strict';

const { LINEAGE } = require('./catalog');
const { Components } = require('./graph');

const EDGE_LIMIT = 2048;

async function loadScopedLineage(input) {
  const db = input.db || await require('../../db').getDatabase();
  const rows = await db.all(
    `SELECT id, source_agent_id AS sourceId, target_agent_id AS targetId, relation_type AS type
       FROM agent_relations
      WHERE organization_id IS ? AND project_id IS ?
      ORDER BY id ASC LIMIT ?`,
    [input.organizationId ?? null, input.projectId ?? null, EDGE_LIMIT + 1]
  );
  if (rows.length > EDGE_LIMIT) {
    throw Object.assign(new Error('RPE_SCOPE_GRAPH_TOO_LARGE'), { code: 'RPE_SCOPE_GRAPH_TOO_LARGE' });
  }
  return rows.filter((row) => LINEAGE.includes(row.type));
}

// A narrow production integration: exclude DECLARED shared ancestry from an
// independence-requesting audience. This does not certify other candidates.
// No caller-supplied independence score is trusted; no authority is granted.
async function excludeKnownDependentAudience(input, candidates) {
  if (input.intent?.independenceRequired !== true || candidates.length === 0) return candidates;
  const sender = input.intent.senderAgentId;
  if (typeof sender !== 'string' || !sender.trim()) throw new Error('RPE_SENDER_REQUIRED');
  const edges = await loadScopedLineage(input);
  const ids = new Set([sender, ...candidates.map((candidate) => candidate.agentId)]);
  for (const edge of edges) { ids.add(edge.sourceId); ids.add(edge.targetId); }
  const graph = new Components([...ids]);
  for (const edge of edges) graph.join(edge.sourceId, edge.targetId);
  return candidates.filter((candidate) => !graph.connected(sender, candidate.agentId));
}

module.exports = { excludeKnownDependentAudience, loadScopedLineage, EDGE_LIMIT };
