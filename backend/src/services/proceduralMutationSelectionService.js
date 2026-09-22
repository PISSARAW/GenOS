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

function pickNodeType(parentId, mutationIndex) {
  const input = `${parentId || 'genesis'}-${mutationIndex}`;
  const hash = crypto.createHash('sha256').update(input).digest('hex').slice(0, 8);
  const index = parseInt(hash, 16) % VALID_NODE_TYPES.length;
  return VALID_NODE_TYPES[index];
}

function pickSourceNode(nodes, seed) {
  // The source must not be a terminal (terminals have no outgoing synapse).
  const candidates = nodes.filter((n) => n.type !== 'terminal');
  const pool = candidates.length ? candidates : nodes;
  if (!pool.length) return null;
  const hash = crypto.createHash('sha256').update(`${seed}-connect`).digest('hex').slice(0, 8);
  return pool[parseInt(hash, 16) % pool.length];
}

function addNodeVariant(parent, index) {
  const org = cloneOrganism(parent);
  org.structure = org.structure || { nodes: [], synapses: [] };
  org.structure.nodes = org.structure.nodes || [];
  org.structure.synapses = org.structure.synapses || [];
  const seed = `${parent.metadata?.id || 'genesis'}-${index}`;
  const newId = `node:${crypto.createHash('sha256').update(`${seed}-addnode`).digest('hex').slice(0, 8)}`;
  const nodeType = pickNodeType(parent.metadata?.id || 'genesis', index);
  const newNode = { id: newId, type: nodeType, required: false, locked: false, metadata: { generated: true, source: 'mutation' } };
  const before = { nodes: deepClone(org.structure.nodes), synapses: deepClone(org.structure.synapses) };
  org.structure.nodes.push(newNode);
  // Connect the new node: a dangling node could never fire and would always
  // fail semantic validation (unreachable from the entrypoint).
  const source = pickSourceNode(org.structure.nodes.slice(0, -1), seed);
  if (source) {
    org.structure.synapses.push({ from: source.id, to: newId, type: 'excitatory', weight: 0.5 });
  }
  const after = { nodes: deepClone(org.structure.nodes), synapses: deepClone(org.structure.synapses) };
  return {
    organism: org,
    operation: {
      op: 'ADD_NODE',
      target: { id: newId, type: nodeType },
      before,
      after,
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

function findAbsentPair(nodes, synapses, seed) {
  const existing = new Set(synapses.map((s) => `${s.from}->${s.to}`));
  const nonTerminal = nodes.filter((n) => n.type !== 'terminal');
  const candidates = [];
  for (const src of nonTerminal.length ? nonTerminal : nodes) {
    for (const tgt of nodes) {
      if (src.id === tgt.id) continue;
      const key = `${src.id}->${tgt.id}`;
      if (!existing.has(key)) candidates.push([src, tgt]);
    }
  }
  if (!candidates.length) return null;
  const hash = crypto.createHash('sha256').update(`${seed}-addsynapse`).digest('hex').slice(0, 8);
  return candidates[parseInt(hash, 16) % candidates.length];
}

function addSynapseVariant(parent, index) {
  const org = cloneOrganism(parent);
  org.structure = org.structure || { nodes: [], synapses: [] };
  org.structure.nodes = org.structure.nodes || [];
  org.structure.synapses = org.structure.synapses || [];
  const before = deepClone(org.structure.synapses);
  let op = { op: 'ADD_SYNAPSE', target: null, before: { synapses: before }, after: null };
  if (org.structure.nodes.length >= 2) {
    const seed = `${parent.metadata?.id || 'genesis'}-${index}`;
    const pair = findAbsentPair(org.structure.nodes, org.structure.synapses, seed);
    if (pair) {
      const [src, tgt] = pair;
      org.structure.synapses.push({ from: src.id, to: tgt.id, type: 'excitatory', weight: 0.5 });
      op.target = { from: src.id, to: tgt.id, type: 'excitatory' };
      op.after = { synapses: deepClone(org.structure.synapses) };
    }
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
    const beforeWeight =
      synapse.weight == null
        ? 0.5
        : Number(synapse.weight);
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

const IDENTITY_FIELDS = ['id', 'version', 'structureHash', 'stateHash', 'mutationSignature', 'updatedAt'];

function withoutIdentity(metadata) {
  const meta = { ...(metadata || {}) };
  for (const field of IDENTITY_FIELDS) delete meta[field];
  return meta;
}

function mutationSignature(operations) {
  const canonical = (operations || []).map((op) => ({
    op: op.op,
    target: op.target || null,
  }));
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0, 16);
}

function sealCandidate(parent, variant, evaluation) {
  const identity = require('./proceduralIdentityService');
  const organism = cloneOrganism(variant?.organism || {});
  const signature = mutationSignature(variant?.operations || []);
  const parentVersion = Number(parent?.metadata?.version) || 0;
  organism.metadata = {
    ...withoutIdentity(parent?.metadata),
    ...withoutIdentity(organism.metadata),
    parentId: parent?.metadata?.id || null,
    version: parentVersion + 1,
    mutationSignature: signature,
  };
  if (evaluation?.fitness != null) {
    organism.fitness = evaluation.fitness;
  }
  if (evaluation?.immune) {
    organism.immune = evaluation.immune;
  }
  organism.metadata.structureHash = identity.structureHash(organism);
  organism.metadata.stateHash = identity.stateHash(organism);
  organism.metadata.id = identity.versionId(organism);
  organism.metadata.updatedAt = new Date().toISOString();
  return organism;
}

function draftMetadata(parent) {
  // A draft candidate inherits NO identity fields from the parent:
  // id/version/hashes/mutationSignature are only set by sealCandidate().
  const meta = withoutIdentity(parent?.metadata);
  meta.parentId = parent?.metadata?.id || null;
  return meta;
}

function generateVariants(parent = {}, count = 4) {
  const variants = [];
  for (let i = 0; i < count; i++) {
    const op = MUTATION_OPS[i % MUTATION_OPS.length];
    const result = op(parent, i);
    // NO_OP (mutation non applicable) — on ne garde pas le variant
    if (!result.operation.target) continue;
    result.organism.metadata = draftMetadata(parent);
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
  sealCandidate,
  mutationSignature,
  MUTATION_OPS,
  cloneOrganism,
};
