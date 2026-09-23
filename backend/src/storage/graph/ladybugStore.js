'use strict';

const NODE_TYPES = new Set([
  'Agent', 'Genome', 'Mission', 'Claim', 'Evidence', 'Finding', 'Daemon',
  'Territory', 'Commit', 'Snapshot', 'Phenotype', 'Capability', 'Memory',
  'Concept', 'Experiment', 'Tool', 'LineageNode', 'LineageEdge',
  'Relation', 'Synapse', 'CollectiveDecision', 'CollectiveVote',
  'Continuation', 'SurvivalWake', 'DaemonTerritory', 'DaemonEvent',
  'DaemonStigmergy', 'DaemonHandoff', 'DaemonRepair', 'DaemonEval',
  'DaemonPhenotype', 'TrinityWorld', 'WorldGraphNode', 'WorldGraphEdge',
]);

const EDGE_TYPES = new Set([
  'PARENT_OF', 'DESCENDS_FROM', 'MUTATED_FROM', 'CROSSED_WITH',
  'HAS_GENOME', 'HAS_PHENOTYPE', 'KNOWS', 'COMMUNICATES_WITH', 'TRUSTS',
  'REPORTS_TO', 'CLAIMS', 'SUPPORTS', 'CONTRADICTS', 'DERIVED_FROM',
  'REMEMBERS', 'ASSOCIATED_WITH', 'CAUSED_BY', 'OBSERVED', 'FOUND',
  'VALIDATED_BY', 'REFUTED_BY', 'EXECUTED', 'USES', 'DEPENDS_ON',
  'FORKED_FROM', 'MERGED_FROM', 'PARENT_COMMIT', 'PRESERVES',
  'TRANSFERRED_TO', 'RELATION', 'SYNAPSE', 'TERRITORY_EDGE',
  'CONCEPT_RELATION', 'WORLD_GRAPH_EDGE',
]);

function escapeCypherString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function validateNodeType(label) {
  if (!NODE_TYPES.has(label)) {
    throw new Error(`Unknown node type: ${label}`);
  }
}

function validateEdgeType(label) {
  if (!EDGE_TYPES.has(label)) {
    throw new Error(`Unknown edge type: ${label}`);
  }
}

/**
 * LadybugDB Graph Store — graph traversal, lineage, provenance, social graph.
 * Projection from SQLite source of truth.
 */
class LadybugStore {
  constructor() {
    this._db = null;
  }

  async init() {
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(__dirname, '../../../.genos/data/graph');
    fs.mkdirSync(dir, { recursive: true });
    const ladybug = require('@ladybugdb/core');
    this._db = new ladybug.Database(path.join(dir, 'world.lbdb'));
    await this._db.init();
    const conn = new ladybug.Connection(this._db);
    await conn.init();
    this._conn = conn;
  }

  get db() {
    return this._db;
  }

  get available() {
    return this._conn !== null;
  }

  async upsertNode(node) {
    const { id, label, properties } = node;
    validateNodeType(label);
    const escapedId = escapeCypherString(id);
    const escapedProps = escapeCypherString(JSON.stringify(properties || {}));
    await this._conn.query(`MERGE (n:${label} {id: '${escapedId}'}) SET n += ${escapedProps}`);
  }

  async upsertEdge(edge) {
    const { id, source, target, label, properties } = edge;
    validateEdgeType(label);
    const escapedSource = escapeCypherString(source);
    const escapedTarget = escapeCypherString(target);
    const escapedId = escapeCypherString(id);
    const escapedProps = escapeCypherString(JSON.stringify(properties || {}));
    await this._conn.query(`MATCH (s {id: '${escapedSource}'}), (t {id: '${escapedTarget}'}) MERGE (s)-[r:${label} {id: '${escapedId}'}]->(t) SET r += ${escapedProps}`);
  }

  async neighbors(query) {
    const { nodeId, direction = 'both', limit = 50 } = query;
    const escapedId = escapeCypherString(nodeId);
    const arrow = direction === 'out' ? '->' : direction === 'in' ? '<-' : '-';
    return this._conn.query(`MATCH (n {id: '${escapedId}'})${arrow}[r]${arrow}(m) RETURN m.id AS node_id, type(r) AS label LIMIT ${limit}`);
  }

  async traverse(query) {
    const { startId, maxDepth = 4 } = query;
    const escapedId = escapeCypherString(startId);
    return this._conn.query(`MATCH p = (start {id: '${escapedId}'})-[*1..${maxDepth}]-(end) RETURN nodes(p) AS nodes, relationships(p) AS edges`);
  }

  async executeQuery(cypher) {
    // Security: never expose executeQuery directly to workers/LLMs
    console.warn('executeQuery is deprecated — use typed methods instead');
    return this._conn.query(cypher);
  }

  async close() {
    if (this._db) await this._db.close();
  }
}

module.exports = { LadybugStore };
