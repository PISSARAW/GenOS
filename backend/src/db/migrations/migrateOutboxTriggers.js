'use strict';

/**
 * Migration 066 — Outbox triggers on graph tables (schema-aware).
 *
 * Each table has:
 *   - id: canonical key (composite-aware)
 *   - scope: organization/project resolution (direct, via_workspace, via_territory)
 *   - aggregate: projection target
 *
 * The projector re-reads the canonical row from SQLite — the outbox
 * only carries the key, not the payload.
 */

const GRAPH_TABLES = [
  { table: 'agents', idColumn: 'id', aggregate: 'agent', scope: 'direct' },
  { table: 'agent_relations', idColumn: 'id', aggregate: 'relation', scope: 'direct' },
  { table: 'lineage_edges', idColumn: 'id', aggregate: 'lineage', scope: 'via_workspace' },
  { table: 'memory_synapses', idColumn: null, idExpr: "memory:" + " || source_id || ':' || target_id", aggregate: 'memory', scope: 'via_workspace' },
  { table: 'knowledge_graph_relations', idColumn: 'id', aggregate: 'concept', scope: 'direct' },
  { table: 'territory_graph_edges', idColumn: 'id', aggregate: 'territory', scope: 'via_territory' },
  { table: 'territory_graph_nodes', idColumn: 'id', aggregate: 'daemon', scope: 'via_territory' },
  { table: 'trinity_worlds', idColumn: 'id', aggregate: 'experiment', scope: 'direct' },
  { table: 'collective_decisions', idColumn: 'id', aggregate: 'claim', scope: 'direct' },
  { table: 'collective_decision_votes', idColumn: null, idExpr: "vote:" + " || decision_id || ':' || voter_agent_id", aggregate: 'claim', scope: 'direct' },
  { table: 'continuation_queue', idColumn: 'id', aggregate: 'mission', scope: 'direct' },
  { table: 'survival_wake_conditions', idColumn: 'id', aggregate: 'mission', scope: 'direct' },
  { table: 'daemon_territory_graph', idColumn: 'id', aggregate: 'daemon', scope: 'via_territory' },
];

const EVENT_MAP = {
  agent: { INSERT: 'AGENT_CREATED', UPDATE: 'AGENT_UPDATED', DELETE: 'AGENT_REMOVED' },
  relation: { INSERT: 'RELATION_ADDED', UPDATE: 'RELATION_UPDATED', DELETE: 'RELATION_REMOVED' },
  lineage: { INSERT: 'LINEAGE_ADDED', UPDATE: 'LINEAGE_UPDATED', DELETE: 'LINEAGE_REMOVED' },
  memory: { INSERT: 'SYNAPSE_ADDED', UPDATE: 'SYNAPSE_UPDATED', DELETE: 'SYNAPSE_REMOVED' },
  concept: { INSERT: 'CONCEPT_RELATION_ADDED', UPDATE: 'CONCEPT_RELATION_UPDATED', DELETE: 'CONCEPT_RELATION_REMOVED' },
  territory: { INSERT: 'TERRITORY_EDGE_ADDED', UPDATE: 'TERRITORY_EDGE_UPDATED', DELETE: 'TERRITORY_EDGE_REMOVED' },
  experiment: { INSERT: 'TRINITY_WORLD_CREATED', UPDATE: 'TRINITY_WORLD_UPDATED', DELETE: 'TRINITY_WORLD_REMOVED' },
  claim: { INSERT: 'COLLECTIVE_DECISION_CREATED', UPDATE: 'COLLECTIVE_DECISION_UPDATED', DELETE: 'COLLECTIVE_DECISION_REMOVED' },
  mission: { INSERT: 'CONTINUATION_QUEUED', UPDATE: 'CONTINUATION_UPDATED', DELETE: 'CONTINUATION_REMOVED' },
  daemon: { INSERT: 'DAEMON_TERRITORY_GRAPH_CREATED', UPDATE: 'DAEMON_TERRITORY_GRAPH_UPDATED', DELETE: 'DAEMON_TERRITORY_GRAPH_REMOVED' },
};

function getEventType(aggregate, op) {
  const events = EVENT_MAP[aggregate];
  return events ? events[op] : op + '_' + aggregate.toUpperCase();
}

function getIdExpr(def, payload) {
  if (def.idColumn) return payload + '.' + def.idColumn;
  return def.idExpr.replace(/source_id/g, payload + '.source_id')
    .replace(/target_id/g, payload + '.target_id')
    .replace(/decision_id/g, payload + '.decision_id')
    .replace(/voter_agent_id/g, payload + '.voter_agent_id');
}

function getScopeExpr(def, payload) {
  if (def.scope === 'direct') {
    return payload + '.organization_id, ' + payload + '.project_id';
  }
  if (def.scope === 'via_workspace') {
    return '(SELECT w.organization_id FROM workspaces w WHERE w.id = ' + payload + '.workspace_id), ' +
      '(SELECT w.project_id FROM workspaces w WHERE w.id = ' + payload + '.workspace_id)';
  }
  if (def.scope === 'via_territory') {
    return '(SELECT t.organization_id FROM daemon_territories t WHERE t.id = ' + payload + '.territory_id), ' +
      '(SELECT t.project_id FROM daemon_territories t WHERE t.id = ' + payload + '.territory_id)';
  }
  return 'NULL, NULL';
}

function buildTrigger(def, operation) {
  const op = operation.toUpperCase();
  const eventType = getEventType(def.aggregate, op);
  const triggerName = 'trg_outbox_' + def.table + '_' + op.toLowerCase();
  const payload = op === 'DELETE' ? 'OLD' : 'NEW';
  const idExpr = getIdExpr(def, payload);
  const scopeExpr = getScopeExpr(def, payload);
  return 'CREATE TRIGGER IF NOT EXISTS ' + triggerName + '\n' +
    'AFTER ' + op + ' ON ' + def.table + '\n' +
    'BEGIN\n' +
    '  INSERT INTO projection_events (event_id, aggregate_type, aggregate_id, event_type, payload_json, organization_id, project_id, created_at)\n' +
    "  VALUES ('evt_' || strftime('%s','now') || '_' || lower(hex(randomblob(4))), '" + def.aggregate + "', " + idExpr + ", '" + eventType + "', " +
    "json_object('table', '" + def.table + "', 'operation', '" + op + "', 'id', " + idExpr + "), " +
    scopeExpr + ", datetime('now'));\n" +
    'END';
}

module.exports = {
  async run(db) {
    for (const def of GRAPH_TABLES) {
      for (const op of ['INSERT', 'UPDATE', 'DELETE']) {
        await db.exec(buildTrigger(def, op));
      }
    }
  }
};
