'use strict';

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}

const fitness = require('./proceduralFitnessService');

function cloneGraph(graph = {}) {
  return {
    nodes: Array.isArray(graph.nodes) ? graph.nodes.map((n) => ({ ...n })) : [],
    edges: Array.isArray(graph.edges) ? graph.edges.map((e) => ({ ...e })) : [],
    metadata: graph.metadata ? { ...graph.metadata } : {},
  };
}

function addNodeVariant(parent, index) {
  const g = cloneGraph(parent);
  const newId = `node-${(g.nodes?.length || 0)}`;
  g.nodes = g.nodes || [];
  g.nodes.push({ id: newId, type: 'generated', source: 'mutation', generated: true });
  return g;
}

function removeNodeVariant(parent, index) {
  const g = cloneGraph(parent);
  if (!g.nodes?.length) return g;
  const target = g.nodes.findIndex((n) => !n.essential && !n.locked);
  if (target >= 0) g.nodes.splice(target, 1);
  return g;
}

function addEdgeVariant(parent, index) {
  const g = cloneGraph(parent);
  if ((g.nodes?.length || 0) < 2) return g;
  const src = g.nodes[0];
  const tgt = g.nodes[g.nodes.length - 1];
  g.edges = g.edges || [];
  g.edges.push({ from: src.id, to: tgt.id, type: 'excitatory', weight: 0.5, generated: true });
  return g;
}

function removeEdgeVariant(parent, index) {
  const g = cloneGraph(parent);
  if (!g.edges?.length) return g;
  const target = g.edges.findIndex((e) => !e.essential);
  if (target >= 0) g.edges.splice(target, 1);
  return g;
}

function adjustWeightVariant(parent, index) {
  const g = cloneGraph(parent);
  if (!g.edges?.length) return g;
  const edge = g.edges[index % g.edges.length];
  const delta = (Math.random() - 0.5) * 0.2;
  edge.weight = clamp01((edge.weight || 0.5) + delta);
  edge.adjusted = true;
  return g;
}

const MUTATION_OPS = [addNodeVariant, removeNodeVariant, addEdgeVariant, removeEdgeVariant, adjustWeightVariant];

function contentHash(obj) {
  const s = JSON.stringify(obj);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(16).padStart(8, '0');
}

function generateVariants(parent = {}, count = 4, options = {}) {
  const variants = [];
  for (let i = 0; i < count; i++) {
    const op = MUTATION_OPS[i % MUTATION_OPS.length];
    const structure = op(parent, i);
    variants.push({
      id: `v-${contentHash(structure)}`,
      parentId: parent.id || null,
      operations: [op.name],
      structure,
      fitness: null,
      immuneRejected: false,
      immuneFindings: [],
    });
  }
  return variants;
}

function evaluateVariants(variants, fitnessFn) {
  return variants.map((v) => ({ ...v, fitness: fitnessFn(v) }));
}

function selectSurvivors(variants, options = {}) {
  const sorted = [...variants].sort((a, b) => b.fitness - a.fitness);
  const survivors = sorted.filter((v) => !v.immuneRejected);
  const topN = options.topN != null ? Number(options.topN) : Math.max(1, Math.ceil(survivors.length / 2));
  return survivors.slice(0, topN);
}

function survivorsDiversity(survivors) {
  if (!Array.isArray(survivors) || !survivors.length) return 0;
  return new Set(survivors.map((s) => s.parentId)).size;
}

module.exports = {
  generateVariants,
  evaluateVariants,
  selectSurvivors,
  survivorsDiversity,
  MUTATION_OPS,
  cloneGraph,
  contentHash,
};
