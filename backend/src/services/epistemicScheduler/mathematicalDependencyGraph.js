'use strict';

const { createFormalResult } = require('../formalResultService');

const NODE_TYPES = Object.freeze(['conjecture', 'lemma', 'theorem', 'counterexample', 'artifact', 'obligation']);
const EDGE_TYPES = Object.freeze(['uses', 'implies', 'specializes', 'contradicts', 'verifies']);
const CAUSAL_EDGES = new Set(['uses', 'implies', 'specializes']);
const READY_STATUSES = new Set(['formalized', 'verified']);

function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}

class MathematicalDependencyGraph {
  constructor() {
    this.nodes = new Map();
    this.edges = new Map();
  }

  addNode(node = {}) {
    const nodeId = requiredText(node.nodeId, 'nodeId');
    if (!NODE_TYPES.includes(node.type)) throw new Error(`Unsupported mathematical node type '${node.type}'.`);
    if (this.nodes.has(nodeId)) throw new Error(`Node '${nodeId}' already exists.`);
    const stored = {
      nodeId, type: node.type,
      canonicalStatement: requiredText(node.canonicalStatement, 'canonicalStatement'),
      status: node.status || 'conjecture',
      resultId: node.resultId || null,
      semanticFingerprint: node.semanticFingerprint || null,
      domainFingerprint: node.domainFingerprint || null,
      disjointDomainFingerprints: [...new Set(node.disjointDomainFingerprints || [])].sort(),
    };
    this.nodes.set(nodeId, stored);
    return { ...stored };
  }

  getNode(nodeId) {
    const node = this.nodes.get(nodeId);
    return node ? { ...node } : null;
  }

  updateStatus(nodeId, status) {
    const node = this.nodes.get(nodeId);
    if (!node) throw new Error(`Unknown node '${nodeId}'.`);
    node.status = status;
    return { ...node };
  }

  addEdge(edge = {}) {
    const from = requiredText(edge.from, 'edge.from');
    const to = requiredText(edge.to, 'edge.to');
    if (!this.nodes.has(from) || !this.nodes.has(to)) throw new Error('Both edge endpoints must exist.');
    if (!EDGE_TYPES.includes(edge.type)) throw new Error(`Unsupported mathematical edge type '${edge.type}'.`);
    const edgeId = edge.edgeId || `${edge.type}:${from}->${to}`;
    if (this.edges.has(edgeId)) throw new Error(`Edge '${edgeId}' already exists.`);
    if (CAUSAL_EDGES.has(edge.type) && this.pathExists(to, from)) throw new Error('Causal mathematical dependencies must be acyclic.');
    const stored = { edgeId, from, to, type: edge.type, witnessResultId: edge.witnessResultId || null };
    this.edges.set(edgeId, stored);
    return { ...stored };
  }

  outgoing(nodeId, causalOnly = false) {
    return [...this.edges.values()].filter((edge) => edge.from === nodeId && (!causalOnly || CAUSAL_EDGES.has(edge.type)));
  }

  incoming(nodeId, causalOnly = false) {
    return [...this.edges.values()].filter((edge) => edge.to === nodeId && (!causalOnly || CAUSAL_EDGES.has(edge.type)));
  }

  pathExists(from, to) {
    const seen = new Set();
    const queue = [from];
    while (queue.length) {
      const current = queue.shift();
      if (current === to) return true;
      if (seen.has(current)) continue;
      seen.add(current);
      queue.push(...this.outgoing(current, true).map((edge) => edge.to));
    }
    return false;
  }

  directDependents(nodeId) {
    return this.outgoing(nodeId, true).map((edge) => edge.to).sort();
  }

  descendants(nodeId) {
    const seen = new Set();
    const queue = this.directDependents(nodeId);
    while (queue.length) {
      const current = queue.shift();
      if (seen.has(current)) continue;
      seen.add(current);
      queue.push(...this.directDependents(current));
    }
    return [...seen];
  }

  openFrontier() {
    return [...this.nodes.values()].filter((node) => {
      if (!['conjecture', 'queued', 'blocked'].includes(node.status)) return false;
      const prerequisites = this.incoming(node.nodeId, true).map((edge) => this.nodes.get(edge.from));
      return prerequisites.every((entry) => READY_STATUSES.has(entry.status));
    }).map((node) => node.nodeId).sort();
  }

  exportGraph() {
    const nodes = [...this.nodes.values()].map((node) => ({ ...node })).sort((left, right) => left.nodeId.localeCompare(right.nodeId));
    const edges = [...this.edges.values()].map((edge) => ({ ...edge })).sort((left, right) => left.edgeId.localeCompare(right.edgeId));
    const roots = nodes.filter((node) => this.incoming(node.nodeId, true).length === 0).map((node) => node.nodeId);
    const leaves = nodes.filter((node) => this.outgoing(node.nodeId, true).length === 0).map((node) => node.nodeId);
    return { contractVersion: 'genos.mathematical-dependency-graph/v1', nodes, edges, roots, leaves };
  }
}

function buildMathematicalGraph(entries = []) {
  const graph = new MathematicalDependencyGraph();
  const normalized = entries.map((entry) => ({ ...entry, result: createFormalResult(entry.result) }));
  for (const entry of normalized) {
    graph.addNode({
      nodeId: entry.result.resultId, type: entry.nodeType,
      canonicalStatement: entry.result.canonicalStatement, status: entry.result.status,
      resultId: entry.result.resultId, semanticFingerprint: entry.result.semanticFingerprint,
      domainFingerprint: entry.domainFingerprint || null,
    });
  }
  for (const entry of normalized) {
    for (const dependency of entry.result.dependencies) {
      graph.addEdge({ from: dependency.resultId, to: entry.result.resultId, type: dependency.relation });
    }
  }
  return graph;
}

module.exports = { NODE_TYPES, EDGE_TYPES, CAUSAL_EDGES, MathematicalDependencyGraph, buildMathematicalGraph };
