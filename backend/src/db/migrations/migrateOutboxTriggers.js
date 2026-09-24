'use strict';

const GRAPH_TABLES = [
  { table: 'agents', idColumn: 'id', aggregate: 'agent' },
  { table: 'agent_relations', idColumn: 'id', aggregate: 'relation' },
  { table: 'lineage_edges', idColumn: 'id', aggregate: 'lineage' },
  { table: 'memory_synapses', idExpr: "'memory:' || NEW.source_id || ':' || NEW.target_id", aggregate: 'memory' },
  { table: 'knowledge_graph_relations', idColumn: 'id', aggregate: 'concept' },
  { table: 'territory_graph_edges', idColumn: 'id', aggregate: 'territory' },
  { table: 'territory_graph_nodes', idColumn: 'id', aggregate: 'daemon' },
  { table: 'trinity_worlds', idColumn: 'id', aggregate: 'experiment' },
  { table: 'collective_decisions', idColumn: 'id', aggregate: 'claim' },
  { table: 'collective_decision_votes', idExpr: "'vote:' || NEW.decision_id || ':' || NEW.voter_agent_id", aggregate: 'claim' },
  { table: 'continuation_queue', idColumn: 'id', aggregate: 'mission' },
  { table: 'survival_wake_conditions', idColumn: 'id', aggregate: 'mission' },
  { table: 'daemon_territory_graph', idColumn: 'id', aggregate: 'daemon' },
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
  // Les expressions custom utilisent NEW : sur DELETE, seul OLD existe.
  return String(def.idExpr).split('NEW').join(payload);
}

function dropTriggerSql(def, operation) {
  return 'DROP TRIGGER IF EXISTS trg_outbox_' + def.table + '_' + operation.toLowerCase();
}

function buildTrigger(def, operation) {
  const op = operation.toUpperCase();
  const eventType = getEventType(def.aggregate, op);
  const triggerName = 'trg_outbox_' + def.table + '_' + op.toLowerCase();
  const payload = op === 'DELETE' ? 'OLD' : 'NEW';
  const idExpr = getIdExpr(def, payload);
  return 'CREATE TRIGGER IF NOT EXISTS ' + triggerName + '\n' +
    'AFTER ' + op + ' ON ' + def.table + '\n' +
    'BEGIN\n' +
    '  INSERT INTO projection_events (event_id, aggregate_type, aggregate_id, event_type, payload_json, created_at)\n' +
    "  VALUES ('evt_' || strftime('%s','now') || '_' || lower(hex(randomblob(4))), '" + def.aggregate + "', " + idExpr + ", '" + eventType + "', " +
    "json_object('table', '" + def.table + "', 'operation', '" + op + "', 'id', " + idExpr + "), datetime('now'));\n" +
    'END';
}

module.exports = {
  async run(db) {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS daemon_territory_graph (
        id TEXT PRIMARY KEY,
        territory_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        node_type TEXT NOT NULL,
        properties_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS territory_graph_nodes (
        id TEXT PRIMARY KEY,
        territory_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        node_type TEXT NOT NULL,
        properties_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    for (const def of GRAPH_TABLES) {
      for (const op of ['INSERT', 'UPDATE', 'DELETE']) {
        await db.exec(dropTriggerSql(def, op));
        await db.exec(buildTrigger(def, op));
      }
    }
  }
};
