'use strict';

const { createMorphologyGraph } = require('./morphologyGraph');
const { validateMorphologyGraph } = require('./morphologyGraphValidator');
const { snapshotMorphologyGraph } = require('./morphologyGraphSnapshot');

function createMorphologyGraphStore(options = {}) {
  return {
    save: (input) => saveGraph(options, input),
    commit: (input) => commitGraph(options, input),
    get: (graphId, version) => readGraph(options, graphId, version),
    listVersions: (graphId) => readVersions(options, graphId)
  };
}

async function saveGraph(options, input) {
  if (input?.status === 'committed') throw new Error('committed graphs require an authorized versioned commit');
  const graph = createMorphologyGraph(input);
  const validation = validateMorphologyGraph(graph);
  if (!validation.valid) throw new Error(`Invalid morphology graph: ${validation.errors.join('; ')}`);
  const db = await resolveDatabase(options);
  const { withTransaction } = require('../../../db');
  return withTransaction(db, (transactionDb) => insertVersion(transactionDb, graph));
}

async function commitGraph(options, input) {
  const errors = commitInputErrors(input);
  if (errors.length) throw new Error(`Morphology graph commit rejected: ${errors.join('; ')}`);
  const graph = createCommittedGraph(input);
  const validation = validateMorphologyGraph(graph);
  if (!validation.valid) throw new Error(`Invalid morphology graph: ${validation.errors.join('; ')}`);
  const db = await resolveDatabase(options);
  const { withTransaction } = require('../../../db');
  return withTransaction(db, (transactionDb) => insertExpectedVersion(transactionDb, graph, input.expectedVersion));
}

function commitInputErrors(input = {}) {
  const errors = [];
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) errors.push('expectedVersion must be a non-negative integer');
  if (!input.graph || !input.graph.graphId) errors.push('graph with a stable graphId is required');
  const authorization = input.authorization || {};
  if (authorization.kernelDecision?.valid !== true || authorization.kernelDecision.decision !== 'APPLY') errors.push('valid Rust kernel APPLY decision is required');
  if (authorization.governance?.allowed !== true) errors.push('governance approval is required');
  return errors;
}

function createCommittedGraph(input) {
  const expectedVersion = input.expectedVersion;
  return createMorphologyGraph({
    ...input.graph,
    version: expectedVersion + 1,
    parentVersion: expectedVersion || null,
    status: 'committed'
  });
}

async function insertExpectedVersion(db, graph, expectedVersion) {
  const latest = await db.get(
    'SELECT MAX(version) AS version FROM morphology_graph_versions WHERE graph_id = ?', graph.graphId
  );
  const actualVersion = latest && latest.version !== null ? latest.version : 0;
  if (actualVersion !== expectedVersion) {
    throw Object.assign(new Error(`stale morphology version: expected ${expectedVersion}, found ${actualVersion}`), {
      code: 'MORPHOLOGY_VERSION_CONFLICT', expectedVersion, actualVersion
    });
  }
  return insertVersion(db, graph);
}

async function insertVersion(db, graph) {
  const latest = await db.get(
    'SELECT MAX(version) AS version FROM morphology_graph_versions WHERE graph_id = ?', graph.graphId
  );
  if (latest && latest.version !== null && graph.version <= latest.version) {
    throw new Error('graph version must increase monotonically');
  }
  const snapshot = snapshotMorphologyGraph(graph);
  await db.run(`INSERT INTO morphology_graph_versions
    (graph_id, version, mission_id, status, parent_version, graph_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
  snapshot.graphId, snapshot.version, snapshot.missionId, snapshot.status,
  snapshot.parentVersion, JSON.stringify(snapshot), snapshot.createdAt);
  return snapshot;
}

async function readGraph(options, graphId, version) {
  const db = await resolveDatabase(options);
  const row = version === undefined
    ? await db.get('SELECT graph_json FROM morphology_graph_versions WHERE graph_id = ? ORDER BY version DESC LIMIT 1', graphId)
    : await db.get('SELECT graph_json FROM morphology_graph_versions WHERE graph_id = ? AND version = ?', graphId, version);
  if (!row) return null;
  const graph = createMorphologyGraph(JSON.parse(row.graph_json));
  const validation = validateMorphologyGraph(graph);
  if (!validation.valid) throw new Error(`Stored morphology graph is invalid: ${validation.errors.join('; ')}`);
  return snapshotMorphologyGraph(graph);
}

async function readVersions(options, graphId) {
  const db = await resolveDatabase(options);
  const rows = await db.all(
    'SELECT version FROM morphology_graph_versions WHERE graph_id = ? ORDER BY version ASC', graphId
  );
  return rows.map((row) => row.version);
}

async function resolveDatabase(options) {
  if (options.db) return options.db;
  const { getDatabase } = require('../../../db');
  return getDatabase();
}

module.exports = { createMorphologyGraphStore };
