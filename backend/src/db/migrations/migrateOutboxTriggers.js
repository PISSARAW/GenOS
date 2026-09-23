'use strict';

const GRAPH_TABLES = [
  { table: 'agents', idColumn: 'id', aggregate: 'agent' },
  { table: 'agent_relations', idColumn: 'id', aggregate: 'relation' },
  { table: 'lineage_edges', idColumn: 'id', aggregate: 'lineage' },
  { table: 'memory_synapses', idColumn: 'id', aggregate: 'memory' },
  { table: 'knowledge_graph_relations', idColumn: 'id', aggregate: 'concept' },
  { table: 'territory_graph_edges', idColumn: 'id', aggregate: 'territory' },
  { table: 'trinity_worlds', idColumn: 'id', aggregate: 'experiment' },
  { table: 'collective_decisions', idColumn: 'id', aggregate: 'claim' },
  { table: 'collective_decision_votes', idColumn: 'decision_id', aggregate: 'claim' },
  { table: 'continuation_queue', idColumn: 'id', aggregate: 'mission' },
  { table: 'survival_wake_conditions', idColumn: 'id', aggregate: 'mission' },
  { table: 'daemon_territory_graph', idColumn: 'id', aggregate: 'daemon' },
  { table: 'territory_graph_nodes', idColumn: 'id', aggregate: 'daemon' },
];

function getEventType(aggregate, operation) {
  const op = operation.toUpperCase();
  if (aggregate === 'agent') {
    if (op === 'INSERT') return 'AGENT_CREATED';
    if (op === 'DELETE') return 'AGENT_REMOVED';
    return 'AGENT_UPDATED';
  }
  if (aggregate === 'relation') {
    if (op === 'INSERT') return 'RELATION_ADDED';
    return 'RELATION_REMOVED';
  }
  if (aggregate === 'lineage') {
    if (op === 'INSERT') return 'LINEAGE_ADDED';
    return 'LINEAGE_REMOVED';
  }
  if (aggregate === 'memory') {
    if (op === 'INSERT') return 'SYNAPSE_ADDED';
    return 'SYNAPSE_REMOVED';
  }
  if (aggregate === 'concept') {
    if (op === 'INSERT') return 'CONCEPT_RELATION_ADDED';
    return 'CONCEPT_RELATION_REMOVED';
  }
  if (aggregate === 'territory') {
    if (op === 'INSERT') return 'TERRITORY_EDGE_ADDED';
    return 'TERRITORY_EDGE_REMOVED';
  }
  if (aggregate === 'experiment') {
    if (op === 'INSERT') return 'TRINITY_WORLD_CREATED';
    return 'TRINITY_WORLD_UPDATED';
  }
  if (aggregate === 'claim') {
    if (op === 'INSERT') return 'COLLECTIVE_DECISION_CREATED';
    if (op === 'DELETE') return 'COLLECTIVE_DECISION_REMOVED';
    return 'COLLECTIVE_DECISION_UPDATED';
  }
  if (aggregate === 'mission') {
    if (op === 'INSERT') return 'CONTINUATION_QUEUED';
    return 'CONTINUATION_UPDATED';
  }
  if (aggregate === 'daemon') {
    if (op === 'INSERT') return 'DAEMON_TERRITORY_GRAPH_CREATED';
    return 'DAEMON_TERRITORY_GRAPH_UPDATED';
  }
  return op + '_' + aggregate.toUpperCase();
}

function buildTrigger(table, idColumn, aggregate, operation) {
  const eventType = getEventType(aggregate, operation);
  const triggerName = 'trg_outbox_' + table + '_' + operation.toLowerCase();
  const payload = operation === 'DELETE' ? 'OLD' : 'NEW';
  const payloadJson = "json_object('table', '" + table + "', 'operation', '" + operation + "', 'id', " + payload + '.' + idColumn + ')';
  return 'CREATE TRIGGER IF NOT EXISTS ' + triggerName + '\n' +
    'AFTER ' + operation + ' ON ' + table + '\n' +
    'BEGIN\n' +
    '  INSERT INTO projection_events (event_id, aggregate_type, aggregate_id, event_type, payload_json, organization_id, project_id, created_at)\n' +
    "  VALUES ('evt_' || strftime('%s','now') || '_' || lower(hex(randomblob(4))), '" + aggregate + "', " + payload + '.' + idColumn + ", '" + eventType + "', " + payloadJson + ', ' + payload + '.organization_id, ' + payload + ".project_id, datetime('now'));\n" +
    'END';
}

module.exports = {
  async run(db) {
    // Ensure tables exist before creating triggers
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
    for (const { table, idColumn, aggregate } of GRAPH_TABLES) {
      for (const op of ['INSERT', 'UPDATE', 'DELETE']) {
        await db.exec(buildTrigger(table, idColumn, aggregate, op));
      }
    }
  }
};
