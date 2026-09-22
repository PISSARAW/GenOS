'use strict';

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}

const crypto = require('crypto');

const VALID_NODE_TYPES = ['action', 'decision', 'terminal', 'gate'];

function cloneOrganism(org) {
  return JSON.parse(JSON.stringify(org));
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function pickNodeType() {
  return VALID_NODE_TYPES[Math.floor(Math.random() * VALID_NODE_TYPES.length)];
}

function addNodeVariant(parent, index) {
  const org = cloneOrganism(parent);
  org.structure = org.structure || { nodes: [], synapses: [] };
  org.structure.nodes = org.structure.nodes || [];
  const newId = `node-${org.structure.nodes.length}`;
  const nodeType = pickNodeType();
  const newNode = { id: newId, type: nodeType, required: false, locked: false, metadata: { generated: true, source: 'mutation' } };
  org.structure.nodes.push(newNode);
  const before = deepClone(org.structure.nodes.slice(0, -1));
  const after = deepClone(org.structure.nodes);
  return {
    organism: org,
    operation: {
      op: 'ADD_NODE',
      target: { id: newId, type: nodeType },
      before: { nodes: before },
      after: { nodes: after }
    },
  };
}

function removeNodeVariant(parent, index) {
  const org = cloneOrganism(parent);
  org.structure = org.structure || { nodes: [], synapses: [] };
  org.structure.nodes = org.structure.nodes || [];
  org.structure.synapses = org.structure.synapses || [];
  
  const beforeNodes = deepClone(org.structure.nodes);
  const beforeSynapses = deepClone(org.structure.synapses);
  
  const targetIdx = org.structure.nodes.findIndex((n) => !n.required && !n.locked);
  let op = { op: 'REMOVE_NODE', target: null, before: { nodes: beforeNodes, synapses: beforeSynapses }, after: null };
  
  if (targetIdx >= 0) {
    const removed = org.structure.nodes.splice(targetIdx, 1)[0];
    const removedId = removed.id;
    
    // Remove incident synapses
    const remainingSynapses = org.structure.synapses.filter(
      s => s.from !== removedId && s.to !== removedId
    );
    const removedSynapses = org.structure.synapses.filter(
      s => s.from === removedId || s.to === removedId
    );
    org.structure.synapses = remainingSynapses;
    
    op.target = { id: removedId, type: removed.type };
    op.after = { 
      nodes: deepClone(org.structure.nodes),
      synapses: deepClone(org.structure.synapses)
    };
    op.removedSynapses = removedSynapses.map(s => ({ from: s.from, to: s.to }));
  }
  return { organism: org, operation: op };
}

function addSynapseVariant(parent, index) {
  const org = cloneOrganism(parent);
  org.structure = org.structure || { nodes: [], synapses: [] };
  org.structure.nodes = org.structure.nodes || [];
  org.structure.synapses = org.structure.synapses || [];
  const before = deepClone(org.structure.synapses);
  let op = { op: 'ADD_SYNAPSE', target: null, before: { synapses: before }, after: null };
  if (org.structure.nodes.length >= 2) {
    const src = org.structure.nodes[0];
    const tgt = org.structure.nodes[org.structure.nodes.length - 1];
    const synapse = { from: src.id, to: tgt.id, type: 'excitatory', weight: 0.5 };
    org.structure.synapses.push(synapse);
    op.target = { from: src.id, to: tgt.id, type: 'excitatory' };
    op.after = { synapses: deepClone(org.structure.synapses) };
  }
  return { organism: org, operation: op };
}

function removeSynapseVariant(parent, index) {
  const org = cloneOrganism(parent);
  org.structure = org.structure || { nodes: [], synapses: [] };
  org.structure.synapses = org.structure.synapses || [];
  const before = deepClone(org.structure.synapses);
  const targetIdx = org.structure.synapses.findIndex((s) => !s.essential);
  let op = { op: 'REMOVE_SYNAPSE', target: null, before: { synapses: before }, after: null };
  if (targetIdx >= 0) {
    const removed = org.structure.synapses.splice(targetIdx, 1)[0];
    op.target = { from: removed.from, to: removed.to };
    op.after = { synapses: deepClone(org.structure.synapses) };
  }
  return { organism: org, operation: op };
}

function adjustWeightVariant(parent, index) {
  const org = cloneOrganism(parent);
  org.structure = org.structure || { nodes: [], synapses: [] };
  org.structure.synapses = org.structure.synapses || [];
  let op = { op: 'ADJUST_WEIGHT', target: null, delta: 0, before: null, after: null };
  if (org.structure.synapses.length) {
    const synapseIdx = index % org.structure.synapses.length;
    const synapse = org.structure.synapses[synapseIdx];
    const beforeWeight = synapse.weight || 0.5;
    const input = `${parent.metadata?.id || ''}-${index}-${synapse.from}-${synapse.to}`;
    const hash = crypto.createHash('sha256').update(input).digest('hex').slice(0, 8);
    const delta = (parseInt(hash, 16) / 0xFFFFFFFF - 0.5) * 0.2;
    const newWeight = clamp01(beforeWeight + delta);
    synapse.weight = newWeight;
    op.target = { from: synapse.from, to: synapse.to };
    op.delta = delta;
    op.before = { weight: beforeWeight };
    op.after = { weight: newWeight };
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
