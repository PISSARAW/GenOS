'use strict';

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}

const fitness = require('./proceduralFitnessService');
const crypto = require('crypto');

function cloneOrganism(org) {
  return JSON.parse(JSON.stringify(org));
}

function addNodeVariant(parent, index) {
  const org = cloneOrganism(parent);
  const newId = `node-${(org.structure?.nodes?.length || 0)}`;
  org.structure = org.structure || { nodes: [], synapses: [] };
  org.structure.nodes = org.structure.nodes || [];
  org.structure.nodes.push({ id: newId, type: 'generated', source: 'mutation' });
  return {
    organism: org,
    operation: { op: 'ADD_NODE', target: { id: newId, type: 'generated' } },
  };
}

function removeNodeVariant(parent, index) {
  const org = cloneOrganism(parent);
  org.structure = org.structure || { nodes: [], synapses: [] };
  org.structure.nodes = org.structure.nodes || [];
  const target = org.structure.nodes.findIndex((n) => !n.required && !n.locked);
  let op = { op: 'REMOVE_NODE', target: null };
  if (target >= 0) {
    const removed = org.structure.nodes.splice(target, 1)[0];
    op.target = { id: removed.id, type: removed.type };
  }
  return { organism: org, operation: op };
}

function addSynapseVariant(parent, index) {
  const org = cloneOrganism(parent);
  org.structure = org.structure || { nodes: [], synapses: [] };
  org.structure.nodes = org.structure.nodes || [];
  org.structure.synapses = org.structure.synapses || [];
  let op = { op: 'ADD_SYNAPSE', target: null };
  if (org.structure.nodes.length >= 2) {
    const src = org.structure.nodes[0];
    const tgt = org.structure.nodes[org.structure.nodes.length - 1];
    const synapse = { from: src.id, to: tgt.id, type: 'excitatory', weight: 0.5 };
    org.structure.synapses.push(synapse);
    op.target = { from: src.id, to: tgt.id };
  }
  return { organism: org, operation: op };
}

function removeSynapseVariant(parent, index) {
  const org = cloneOrganism(parent);
  org.structure = org.structure || { nodes: [], synapses: [] };
  org.structure.synapses = org.structure.synapses || [];
  const target = org.structure.synapses.findIndex((s) => !s.essential);
  let op = { op: 'REMOVE_SYNAPSE', target: null };
  if (target >= 0) {
    const removed = org.structure.synapses.splice(target, 1)[0];
    op.target = { from: removed.from, to: removed.to };
  }
  return { organism: org, operation: op };
}

function adjustWeightVariant(parent, index) {
  const org = cloneOrganism(parent);
  org.structure = org.structure || { nodes: [], synapses: [] };
  org.structure.synapses = org.structure.synapses || [];
  let op = { op: 'ADJUST_WEIGHT', target: null, delta: 0 };
  if (org.structure.synapses.length) {
    const synapse = org.structure.synapses[index % org.structure.synapses.length];
    const input = `${parent.metadata?.id || ''}-${index}-${synapse.from}-${synapse.to}`;
    const hash = crypto.createHash('sha256').update(input).digest('hex').slice(0, 8);
    const delta = (parseInt(hash, 16) / 0xFFFFFFFF - 0.5) * 0.2;
    synapse.weight = clamp01((synapse.weight || 0.5) + delta);
    op.target = { from: synapse.from, to: synapse.to };
    op.delta = delta;
    op.before = { weight: (synapse.weight || 0.5) - delta };
    op.after = { weight: synapse.weight };
  }
  return { organism: org, operation: op };
}

const MUTATION_OPS = [addNodeVariant, removeNodeVariant, addSynapseVariant, removeSynapseVariant, adjustWeightVariant];

function generateVariants(parent = {}, count = 4) {
  const variants = [];
  for (let i = 0; i < count; i++) {
    const op = MUTATION_OPS[i % MUTATION_OPS.length];
    const result = op(parent, i);
    const contentId = crypto.createHash('sha256')
      .update(JSON.stringify(result.organism.structure))
      .digest('hex').slice(0, 12);
    variants.push({
      id: `v-${contentId}`,
      parentId: parent.metadata?.id || null,
      operations: [result.operation],
      organism: result.organism,
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
  cloneOrganism,
};
