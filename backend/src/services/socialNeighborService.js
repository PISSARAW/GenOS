'use strict';

const relations = require('./crossAgentRelationalService');

function coordinate(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Social position ${field} must be finite.`);
  return number;
}

function parseMetadata(value, agentId) {
  try {
    const parsed = JSON.parse(value || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid metadata');
    return parsed;
  } catch (_) {
    throw new Error(`Agent '${agentId}' has invalid metadata JSON.`);
  }
}

function positionFrom(metadata, agentId) {
  const position = metadata.socialPosition;
  if (!position || typeof position !== 'object') throw new Error(`Agent '${agentId}' has no social position.`);
  return { x: coordinate(position.x, 'x'), y: coordinate(position.y, 'y') };
}

function distanceBetween(left, right) {
  return Math.hypot(left.position.x - right.position.x, left.position.y - right.position.y);
}

function orderedPair(left, right) {
  return left.id < right.id ? [left, right] : [right, left];
}

function neighborPairs(agents, radius) {
  const pairs = [];
  for (let leftIndex = 0; leftIndex < agents.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < agents.length; rightIndex += 1) {
      const [left, right] = orderedPair(agents[leftIndex], agents[rightIndex]);
      const distance = distanceBetween(left, right);
      if (distance <= radius) pairs.push({ left, right, distance });
    }
  }
  return pairs;
}

function validateScope(input) {
  const organizationId = String(input.organizationId || '').trim();
  const projectId = String(input.projectId || '').trim();
  const radius = Number(input.radius);
  if (!organizationId || !projectId) throw new Error('Organization and project scope are required.');
  if (!Number.isFinite(radius) || radius <= 0) throw new Error('Neighbor radius must be positive and finite.');
  return { organizationId, projectId, radius };
}

async function loadScopedAgents(db, scope) {
  const rows = await db.all(
    `SELECT a.id, a.metadata_json AS metadataJson
     FROM agents a JOIN workspaces w ON w.id = a.workspace_id
     WHERE w.organization_id = ? AND w.project_id = ? AND a.status NOT IN ('terminated', 'apoptosis', 'error')
     ORDER BY a.id`,
    [scope.organizationId, scope.projectId]
  );
  return rows.map((row) => ({ id: row.id, position: positionFrom(parseMetadata(row.metadataJson, row.id), row.id) }));
}

async function loadExistingNeighbors(db, scope) {
  return db.all(
    `SELECT id, source_agent_id AS sourceAgentId, target_agent_id AS targetAgentId
     FROM agent_relations WHERE relation_type = 'neighbor' AND organization_id = ? AND project_id = ?`,
    [scope.organizationId, scope.projectId]
  );
}

function edgeKey(source, target) {
  return `${source}\u0001${target}`;
}

async function reconcileNeighborEdges({ db, scope, pairs, existing } = {}) {
  const desired = new Map(pairs.map((pair) => [edgeKey(pair.left.id, pair.right.id), pair]));
  const current = new Map(existing.map((edge) => [edgeKey(edge.sourceAgentId, edge.targetAgentId), edge]));
  let created = 0;
  let removed = 0;
  for (const [key, edge] of current) {
    if (!desired.has(key)) {
      await db.run('DELETE FROM agent_relations WHERE id = ?', [edge.id]);
      removed += 1;
    }
  }
  for (const [key, pair] of desired) {
    const metadata = { spatiallyDerived: true, distance: Number(pair.distance.toFixed(6)), radius: scope.radius };
    if (current.has(key)) {
      await db.run('UPDATE agent_relations SET metadata_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [JSON.stringify(metadata), current.get(key).id]);
      continue;
    }
    await relations.createRelation({ db, id: `neighbor:${scope.organizationId}:${scope.projectId}:${pair.left.id}:${pair.right.id}`,
      sourceAgentId: pair.left.id, targetAgentId: pair.right.id, relationType: 'neighbor', relationClass: 'social',
      organizationId: scope.organizationId, projectId: scope.projectId, metadata });
    created += 1;
  }
  return { created, removed, retained: desired.size - created };
}

async function recalculateNeighborsOnDb(db, scope) {
  const agents = await loadScopedAgents(db, scope);
  const pairs = neighborPairs(agents, scope.radius);
  const existing = await loadExistingNeighbors(db, scope);
  const changes = await reconcileNeighborEdges({ db: db, scope: scope, pairs: pairs, existing: existing });
  return { organizationId: scope.organizationId, projectId: scope.projectId, radius: scope.radius,
    agents: agents.map((agent) => agent.id), neighbors: pairs.map(({ left, right, distance }) => ({
      sourceAgentId: left.id, targetAgentId: right.id, distance: Number(distance.toFixed(6))
    })), changes };
}

async function recalculateNeighbors(input = {}) {
  const scope = validateScope(input);
  const db = input.db || await require('../db').getDatabase();
  return require('../db').withTransaction(db, (tx) => recalculateNeighborsOnDb(tx, scope));
}

async function moveAgent(input = {}) {
  const db = input.db || await require('../db').getDatabase();
  const agentId = String(input.agentId || '').trim();
  if (!agentId) throw new Error('Agent ID is required.');
  const x = coordinate(input.x, 'x');
  const y = coordinate(input.y, 'y');
  const scope = validateScope(input);
  return require('../db').withTransaction(db, async (tx) => {
    const row = await tx.get(
      `SELECT a.metadata_json AS metadataJson FROM agents a JOIN workspaces w ON w.id = a.workspace_id
       WHERE a.id = ? AND w.organization_id = ? AND w.project_id = ?`,
      [agentId, scope.organizationId, scope.projectId]
    );
    if (!row) throw new Error(`Agent '${agentId}' is outside the requested organization/project.`);
    const metadata = parseMetadata(row.metadataJson, agentId);
    metadata.socialPosition = { x, y };
    await tx.run('UPDATE agents SET metadata_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [JSON.stringify(metadata), agentId]);
    return recalculateNeighborsOnDb(tx, scope);
  });
}

module.exports = { moveAgent, recalculateNeighbors };
