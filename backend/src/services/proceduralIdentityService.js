'use strict';

const crypto = require('crypto');

const VALID_NODE_TYPES = ['action', 'decision', 'terminal', 'gate'];
const VALID_SYNAPSE_TYPES = ['excitatory', 'inhibitory', 'modulatory'];
const VALID_LIFECYCLES = ['active', 'weakened', 'dormant', 'candidate_for_pruning', 'pruned'];
const VALID_METHYLATION_TYPES = ['synapse', 'procedure'];
const VALID_IMMUNE_GATES = ['REJECT', 'ALLOW', 'QUARANTINE'];

function num(value, fallback = 0) {
  if (value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function structureHash(organism) {
  if (!organism || !organism.structure) return '';
  const s = organism.structure;
  const nodes = Array.isArray(s.nodes)
    ? [...s.nodes].sort((a, b) => String(a.id).localeCompare(String(b.id)))
    : [];
  const synapses = Array.isArray(s.synapses)
    ? [...s.synapses].sort((a, b) =>
        `${a.from}->${a.to}`.localeCompare(`${b.from}->${b.to}`)
      )
    : [];
  const canonical = {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      required: n.required,
      // Include behavioral metadata that affects procedural semantics
      metadata: n.metadata ? pickBehavioralMetadata(n.metadata) : undefined,
    })),
    synapses: synapses.map((s) => ({
      from: s.from, to: s.to, type: s.type,
      condition: s.condition || null,
    })),
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0, 16);
}

function pickBehavioralMetadata(metadata) {
  // Only include fields that affect procedural behavior
  const behavioralKeys = ['capability', 'tool', 'action', 'capabilityType', 'executionMode'];
  const result = {};
  for (const key of behavioralKeys) {
    if (metadata[key] != null) result[key] = metadata[key];
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function stateHash(organism) {
  const synapses = Array.isArray(organism?.structure?.synapses)
    ? [...organism.structure.synapses].sort((a, b) =>
        `${a.from}->${a.to}`.localeCompare(`${b.from}->${b.to}`)
      )
    : [];
  const state = {
    synapses: synapses.map((s) => ({
      from: s.from, to: s.to, weight: s.weight,
      lifecycle: s.lifecycle,
    })),
    phenotype: canonicalizeObject(organism?.phenotype || {}),
    immune: canonicalizeObject(organism?.immune || {}),
    fitness: canonicalizeObject(organism?.fitness || {}),
    plasticity: canonicalizeObject(organism?.plasticity || {}),
  };
  return crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex').slice(0, 16);
}

function canonicalizeObject(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    // For arrays of objects with IDs, sort by ID
    if (obj.length > 0 && obj[0] && typeof obj[0] === 'object' && obj[0].id) {
      return [...obj].sort((a, b) => String(a.id).localeCompare(String(b.id))).map(canonicalizeObject);
    }
    // For arrays of primitives or non-identity objects, preserve order if semantic
    return obj.map(canonicalizeObject);
  }
  // Sort object keys for deterministic serialization
  const sorted = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = canonicalizeObject(obj[key]);
  }
  return sorted;
}

function versionId(organism) {
  const parent = organism?.metadata?.parentId || 'genesis';
  const sHash = structureHash(organism);
  const stHash = stateHash(organism);
  const mutationSig = organism?.metadata?.mutationSignature || '';
  return crypto.createHash('sha256')
    .update(`${parent}:${sHash}:${stHash}:${mutationSig}`)
    .digest('hex').slice(0, 16);
}

function canonicalEpisode(episode) {
  return {
    trajectory: Array.isArray(episode.trajectory)
      ? episode.trajectory.map(String)
      : [],
    outcome: String(episode.outcome || ''),
    context: episode.context || {},
  };
}

function episodeHash(episode) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(canonicalEpisode(episode)))
    .digest('hex').slice(0, 12);
}

function createOccurrenceId(prefix = 'occ') {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}

function validateRequiredFields(organism, errors) {
  if (!organism.apiVersion) errors.push('missing apiVersion');
  if (!organism.kind) errors.push('missing kind');
  if (!organism.metadata) errors.push('missing metadata');
  if (!organism.metadata?.id) errors.push('missing metadata.id');
  if (!organism.metadata?.version) errors.push('missing metadata.version');
  if (!organism.structure) errors.push('missing structure');
  if (!Array.isArray(organism.structure?.nodes)) errors.push('structure.nodes must be array');
  if (!Array.isArray(organism.structure?.synapses)) errors.push('structure.synapses must be array');
}

function validateNodes(nodes, errors) {
  if (!Array.isArray(nodes)) return;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node.id) errors.push(`structure.nodes[${i}].id is required`);
    if (node.type && !VALID_NODE_TYPES.includes(node.type)) {
      errors.push(`structure.nodes[${i}].type must be one of: ${VALID_NODE_TYPES.join(', ')}`);
    }
  }
}

function validateSynapseRequired(synapse, i, errors) {
  if (!synapse.from) errors.push(`structure.synapses[${i}].from is required`);
  if (!synapse.to) errors.push(`structure.synapses[${i}].to is required`);
  if (!synapse.type) errors.push(`structure.synapses[${i}].type is required`);
}

function validateSynapseType(synapse, i, errors) {
  if (synapse.type && !VALID_SYNAPSE_TYPES.includes(synapse.type)) {
    errors.push(`structure.synapses[${i}].type must be one of: ${VALID_SYNAPSE_TYPES.join(', ')}`);
  }
}

function validateSynapseWeight(synapse, i, errors) {
  if (synapse.weight != null && (synapse.weight < 0 || synapse.weight > 1)) {
    errors.push(`structure.synapses[${i}].weight must be between 0 and 1`);
  }
}

function validateSynapseLifecycle(synapse, i, errors) {
  if (synapse.lifecycle && !VALID_LIFECYCLES.includes(synapse.lifecycle)) {
    errors.push(`structure.synapses[${i}].lifecycle invalid`);
  }
}

function validateSynapses(synapses, errors) {
  if (!Array.isArray(synapses)) return;
  for (let i = 0; i < synapses.length; i++) {
    const synapse = synapses[i];
    validateSynapseRequired(synapse, i, errors);
    validateSynapseType(synapse, i, errors);
    validateSynapseWeight(synapse, i, errors);
    validateSynapseLifecycle(synapse, i, errors);
  }
}

function validateSynapseNodes(nodes, synapses, errors) {
  if (!Array.isArray(nodes) || !Array.isArray(synapses)) return;
  const nodeIds = new Set(nodes.map(n => n.id));
  for (let i = 0; i < synapses.length; i++) {
    const synapse = synapses[i];
    if (synapse.from && !nodeIds.has(synapse.from)) {
      errors.push(`structure.synapses[${i}].from references non-existent node: ${synapse.from}`);
    }
    if (synapse.to && !nodeIds.has(synapse.to)) {
      errors.push(`structure.synapses[${i}].to references non-existent node: ${synapse.to}`);
    }
  }
}

function validateMethylation(methylation, errors) {
  if (!Array.isArray(methylation)) return;
  for (let i = 0; i < methylation.length; i++) {
    const m = methylation[i];
    if (!m.target?.type) errors.push(`phenotype.methylation[${i}].target.type is required`);
    if (m.target?.type && !VALID_METHYLATION_TYPES.includes(m.target.type)) {
      errors.push(`phenotype.methylation[${i}].target.type must be synapse or procedure`);
    }
    if (m.type !== 'repression') errors.push(`phenotype.methylation[${i}].type must be repression`);
    if (m.strength == null || m.strength < 0 || m.strength > 1) {
      errors.push(`phenotype.methylation[${i}].strength must be between 0 and 1`);
    }
  }
}

function validateImmuneSignatures(signatures, errors) {
  if (!Array.isArray(signatures)) return;
  for (let i = 0; i < signatures.length; i++) {
    const sig = signatures[i];
    if (!sig.id) errors.push(`immune.signatures[${i}].id is required`);
    if (sig.response?.gate && !VALID_IMMUNE_GATES.includes(sig.response.gate)) {
      errors.push(`immune.signatures[${i}].response.gate must be REJECT, ALLOW, or QUARANTINE`);
    }
  }
}

function validateOrganism(organism) {
  const errors = [];
  if (!organism) return { valid: false, errors: ['organism is null'] };
  
  validateRequiredFields(organism, errors);
  validateNodes(organism.structure?.nodes, errors);
  validateSynapses(organism.structure?.synapses, errors);
  validateSynapseNodes(organism.structure?.nodes, organism.structure?.synapses, errors);
  validateMethylation(organism.phenotype?.methylation, errors);
  validateImmuneSignatures(organism.immune?.signatures, errors);
  
  return { valid: errors.length === 0, errors };
}

function validateProceduralOrganism(organism) {
  const result = validateOrganism(organism);
  if (!result.valid) {
    throw new Error(`ProceduralOrganism validation failed: ${result.errors.join('; ')}`);
  }
  return true;
}

module.exports = {
  num,
  structureHash,
  stateHash,
  versionId,
  canonicalEpisode,
  episodeHash,
  createOccurrenceId,
  validateOrganism,
  validateProceduralOrganism,
};
