'use strict';

const { createMorphologyGraph } = require('./morphologyGraph');
const { validateMorphologyGraph } = require('./morphologyGraphValidator');
const { snapshotMorphologyGraph } = require('./morphologyGraphSnapshot');

function createMorphologyGraphStore(options = {}) {
  return {
    save: (input) => saveGraph(options, input),
    get: (graphId, version) => readGraph(options, graphId, version),
    listVersions: (graphId) => readVersions(options, graphId)
  };
}

async function saveGraph(options, input) {
  const graph = createMorphologyGraph(input);
  const validation = validateMorphologyGraph(graph);
  if (!validation.valid) throw new Error(`Invalid morphology graph: ${validation.errors.join('; ')}`);
  const db = await resolveDatabase(options);
  const { withTransaction } = require('../../../db');
  return withTransaction(db, (transactionDb) => insertVersion(transactionDb, graph));
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
