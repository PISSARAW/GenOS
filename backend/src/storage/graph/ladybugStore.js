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
 * Map arbitrary domain relation names onto the closed EDGE_TYPES vocabulary.
 * Unknown inputs fall back to generic buckets — never interpolated raw.
 */
function normalizeEdgeType(raw) {
  if (!raw) return 'RELATION';
  const upper = String(raw).toUpperCase().replace(/[^A-Z_]/g, '_').replace(/_+/g, '_');
  if (EDGE_TYPES.has(upper)) return upper;
  if (upper.includes('SYnapse'.toUpperCase()) || upper.includes('MEMORY')) return 'SYNAPSE';
  if (upper.includes('TERRITORY')) return 'TERRITORY_EDGE';
  if (upper.includes('CONCEPT') || upper.includes('KNOWLEDGE')) return 'CONCEPT_RELATION';
  if (upper.includes('LINEAGE') || upper.includes('DESCEND')) return 'DESCENDS_FROM';
  return 'RELATION';
}

function normalizeNodeType(raw, fallback = 'WorldGraphNode') {
  if (!raw) return fallback;
  const cap = String(raw).charAt(0).toUpperCase() + String(raw).slice(1);
  if (NODE_TYPES.has(cap)) return cap;
  if (NODE_TYPES.has(String(raw))) return String(raw);
  return fallback;
}

function toCypherValue(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return `'${escapeCypherString(JSON.stringify(value))}'`;
  return `'${escapeCypherString(value)}'`;
}

function toCypherMap(obj) {
  const entries = Object.entries(obj || {});
  if (!entries.length) return '{}';
  return `{${entries.map(([k, v]) => `${k.replace(/[^A-Za-z0-9_]/g, '_')}: ${toCypherValue(v)}`).join(', ')}}`;
}

function toInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(1000, Math.floor(n)));
}

/**
 * LadybugDB Graph Store — graph traversal, lineage, provenance, social graph.
 * Projection from SQLite source of truth. All paths via StoragePaths.
 */
class LadybugStore {
  constructor(options = {}) {
    this._db = null;
    this._conn = null;
    this._dbPath = options.dbPath || null;
  }

  async init() {
    const { FILES, ensureDirs } = require('../storagePaths');
    ensureDirs();
    const dbPath = this._dbPath || FILES.ladybug;
    const ladybug = require('@ladybugdb/core');
    this._db = new ladybug.Database(dbPath);
    await this._db.init();
    const conn = new ladybug.Connection(this._db);
    await conn.init();
    this._conn = conn;
    return this;
  }

  get db() {
    return this._db;
  }

  get available() {
    return !!this._db && !!this._conn;
  }

  _requireConn() {
    if (!this._conn) throw new Error('LadybugStore not initialized');
    return this._conn;
  }

  async upsertNode(node) {
    const conn = this._requireConn();
    const label = normalizeNodeType(node.label);
    validateNodeType(label);
    const id = String(node.id);
    const props = toCypherMap(node.properties || {});
    await conn.query(`MERGE (n:${label} {id: '${escapeCypherString(id)}'}) SET n += ${props}`);
  }

  async upsertEdge(edge) {
    const conn = this._requireConn();
    const label = normalizeEdgeType(edge.label);
    validateEdgeType(label);
    const source = String(edge.source);
    const target = String(edge.target);
    const id = String(edge.id);
    const props = toCypherMap(edge.properties || {});
    await conn.query(
      `MATCH (s {id: '${escapeCypherString(source)}'}), (t {id: '${escapeCypherString(target)}'}) ` +
      `MERGE (s)-[r:${label} {id: '${escapeCypherString(id)}'}]->(t) SET r += ${props}`
    );
  }

  async deleteNode(id) {
    const conn = this._requireConn();
    await conn.query(`MATCH (n {id: '${escapeCypherString(String(id))}'}) DETACH DELETE n`);
  }

  async deleteEdge(id) {
    const conn = this._requireConn();
    await conn.query(`MATCH ()-[r {id: '${escapeCypherString(String(id))}'}]-() DELETE r`);
  }

  async deleteEdgesFrom(nodeId) {
    const conn = this._requireConn();
    await conn.query(`MATCH (s {id: '${escapeCypherString(String(nodeId))}'})-[r]->() DELETE r`);
  }

  async deleteEdgesTo(nodeId) {
    const conn = this._requireConn();
    await conn.query(`MATCH ()-[r]->(t {id: '${escapeCypherString(String(nodeId))}'}) DELETE r`);
  }

  async neighbors(query) {
    const conn = this._requireConn();
    const nodeId = String(query.nodeId);
    const direction = query.direction || 'both';
    const limit = toInt(query.limit, 50);
    const arrow = direction === 'out' ? '->' : direction === 'in' ? '<-' : '-';
    return conn.query(
      `MATCH (n {id: '${escapeCypherString(nodeId)}'})${arrow}[r]${arrow}(m) RETURN m.id AS node_id, type(r) AS label LIMIT ${limit}`
    );
  }

  async traverse(query) {
    const conn = this._requireConn();
    const startId = String(query.startId);
    const maxDepth = toInt(query.maxDepth, 4);
    return conn.query(
      `MATCH p = (start {id: '${escapeCypherString(startId)}'})-[*1..${maxDepth}]-(end) RETURN nodes(p) AS nodes, relationships(p) AS edges`
    );
  }

  async shortestPath(query) {
    const conn = this._requireConn();
    const sourceId = String(query.sourceId);
    const targetId = String(query.targetId);
    const maxDepth = toInt(query.maxDepth, 6);
    return conn.query(
      `MATCH p = shortestPath((s {id: '${escapeCypherString(sourceId)}'})-[*1..${maxDepth}]-(t {id: '${escapeCypherString(targetId)}'})) RETURN nodes(p) AS nodes, relationships(p) AS edges`
    );
  }

  async executeReadQuery(query) {
    if (query.type === 'neighbors') return this.neighbors(query);
    if (query.type === 'traverse') return this.traverse(query);
    if (query.type === 'shortestPath') return this.shortestPath(query);
    throw new Error(`LadybugStore does not support query type: ${query.type}`);
  }

  async executeQuery(cypher) {
    // Security: never expose executeQuery directly to workers/LLMs.
    console.warn('executeQuery is deprecated — use typed methods instead');
    return this._requireConn().query(cypher);
  }

  async close() {
    if (this._conn) {
      try { await this._conn.close(); } catch (_) { /* already closed */ }
      this._conn = null;
    }
    if (this._db) {
      try { await this._db.close(); } catch (_) { /* already closed */ }
      this._db = null;
    }
  }
}

module.exports = { LadybugStore, normalizeEdgeType, normalizeNodeType };
