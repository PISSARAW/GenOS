'use strict';

const crypto = require('node:crypto');
const { ensureSchema, loadExperiment } = require('./proceduralCausalExperimentService');

function validateGraph(graph) {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)
    || !Array.isArray(graph.evidenceRefs)) throw new Error('A causal graph and evidence references are required.');
  const refs = new Set(graph.evidenceRefs);
  const nodes = new Map();
  for (const node of graph.nodes) {
    validateNode(node, refs);
    if (nodes.has(node.id)) throw new Error(`Duplicate causal graph node '${node.id}'.`);
    nodes.set(node.id, node);
  }
  validateEdges(graph.edges, nodes, refs);
  validateAcyclic(nodes, graph.edges);
  return { nodes, refs };
}

function validateNode(node, refs) {
  const supportedKinds = ['intervention', 'step', 'mediator', 'outcome'];
  if (!node.id || !supportedKinds.includes(node.kind)) {
    throw new Error('Causal graph nodes require an id and a supported kind.');
  }
  const validEvidence = Array.isArray(node.evidenceRefs) && node.evidenceRefs.length
    && node.evidenceRefs.every((ref) => refs.has(ref));
  if (!validEvidence) throw new Error('Every causal graph node needs declared evidence.');
}

function validateAcyclic(nodes, edges) {
  const incoming = new Map([...nodes.keys()].map((nodeId) => [nodeId, 0]));
  const downstream = new Map([...nodes.keys()].map((nodeId) => [nodeId, []]));
  for (const edge of edges) {
    incoming.set(edge.target, incoming.get(edge.target) + 1);
    downstream.get(edge.source).push(edge.target);
  }
  const queue = [...incoming].filter(([, count]) => count === 0).map(([nodeId]) => nodeId);
  let visited = 0;
  while (queue.length) {
    const current = queue.shift();
    visited += 1;
    for (const next of downstream.get(current)) {
      incoming.set(next, incoming.get(next) - 1);
      if (incoming.get(next) === 0) queue.push(next);
    }
  }
  if (visited !== nodes.size) throw new Error('Causal evidence graph must be acyclic.');
}

function validateEdges(edges, nodes, refs) {
  for (const edge of edges) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target) || edge.source === edge.target) {
      throw new Error('Causal graph edges must reference distinct existing nodes.');
    }
    if (edge.status !== 'observed' || !Array.isArray(edge.evidenceRefs) || !edge.evidenceRefs.length
      || edge.evidenceRefs.some((ref) => !refs.has(ref))) {
      throw new Error('Causal graph edges must be observed and reference declared evidence.');
    }
  }
}

function canonicalGraph(graph) {
  return {
    schema: 'genos.procedural-causal-graph/v1',
    nodes: [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...graph.edges].sort((a, b) => `${a.source}:${a.target}`.localeCompare(`${b.source}:${b.target}`)),
    evidenceRefs: [...new Set(graph.evidenceRefs)].sort(),
    attributionLimit: 'observed-links-only; no universal or unmeasured-mediator claims',
  };
}

async function persistCausalGraph(db, input) {
  return require('../db').withTransaction(db, () => persistBoundGraph(db, input));
}

async function persistBoundGraph(db, input) {
  await ensureSchema(db);
  await ensureEvidenceSchema(db);
  validateGraph(input.graph);
  const experiment = await verifyEvidenceReferences(db, input);
  const graph = canonicalGraph(input.graph);
  if (require('./pairedReplayProtocol').enabled(experiment)) graph.replayControls = require('./pairedReplayConsumer').metadata(experiment);
  const payload = JSON.stringify(graph);
  const graphHash = crypto.createHash('sha256').update(payload).digest('hex');
  const graphId = `causal_graph_${graphHash.slice(0, 24)}`;
  await db.exec(`CREATE TABLE IF NOT EXISTS procedural_causal_graphs (
    graph_id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL,
    graph_hash TEXT NOT NULL, graph_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(experiment_id, graph_hash)
  );`);
  await db.run(`INSERT OR IGNORE INTO procedural_causal_graphs
    (graph_id, experiment_id, graph_hash, graph_json) VALUES (?, ?, ?, ?)`,
  [graphId, input.experimentId, graphHash, payload]);
  return { graphId, graphHash, ...graph };
}

async function ensureEvidenceSchema(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS procedural_causal_diffs (
    diff_id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL, baseline_fork_id TEXT NOT NULL,
    intervention_fork_id TEXT NOT NULL, diff_hash TEXT NOT NULL, diff_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(baseline_fork_id, intervention_fork_id)
  );
  CREATE TABLE IF NOT EXISTS procedural_causal_analyses (
    analysis_id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL, analysis_hash TEXT NOT NULL,
    payload_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(experiment_id, analysis_hash)
  );`);
}

async function verifyEvidenceReferences(db, input) {
  const experiment = await loadExperiment(db, input.experimentId);
  if (!experiment) throw new Error('Unknown causal experiment for evidence graph.');
  require('./pairedReplayProtocol').verify(experiment, input);
  const snapshots = JSON.parse(experiment.snapshot_hashes_json);
  for (const ref of input.graph.evidenceRefs) {
    if (!(await evidenceReferenceExists(db, ref, { experimentId: input.experimentId, snapshots }))) {
      throw new Error(`Causal graph evidence reference is not persisted for this experiment: ${ref}`);
    }
  }
  await require('./pairedReplayConsumer').graph(db, { experiment, input });
  return experiment;
}

async function evidenceReferenceExists(db, ref, context) {
  const [kind, id, hash] = String(ref).split(':');
  if (kind === 'snapshot') return context.snapshots[id] === hash;
  const tables = {
    fork: ['procedural_causal_forks', 'fork_id'],
    diff: ['procedural_causal_diffs', 'diff_id'],
    analysis: ['procedural_causal_analyses', 'analysis_id'],
  };
  const table = tables[kind];
  if (!table) return false;
  return Boolean(await db.get(
    `SELECT ${table[1]} FROM ${table[0]} WHERE ${table[1]} = ? AND experiment_id = ?`,
    [id, context.experimentId],
  ));
}

module.exports = { validateGraph, persistCausalGraph };
