'use strict';

const crypto = require('crypto');

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
    nodes: nodes.map((n) => ({ id: n.id, type: n.type, required: n.required })),
    synapses: synapses.map((s) => ({
      from: s.from, to: s.to, type: s.type,
      condition: s.condition || null,
    })),
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0, 16);
}

function stateHash(organism) {
  const state = {
    synapses: (organism?.structure?.synapses || []).map((s) => ({
      from: s.from, to: s.to, weight: s.weight,
      lifecycle: s.lifecycle,
    })),
    phenotype: organism?.phenotype || {},
    immune: organism?.immune || {},
    fitness: organism?.fitness || {},
    plasticity: organism?.plasticity || {},
  };
  return crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex').slice(0, 16);
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

function validateOrganism(organism) {
  const errors = [];
  if (!organism) return { valid: false, errors: ['organism is null'] };
  if (!organism.apiVersion) errors.push('missing apiVersion');
  if (!organism.kind) errors.push('missing kind');
  if (!organism.metadata) errors.push('missing metadata');
  if (!organism.metadata?.id) errors.push('missing metadata.id');
  if (!organism.metadata?.version) errors.push('missing metadata.version');
  if (!organism.structure) errors.push('missing structure');
  if (!Array.isArray(organism.structure?.nodes)) errors.push('structure.nodes must be array');
  if (!Array.isArray(organism.structure?.synapses)) errors.push('structure.synapses must be array');
  
  if (Array.isArray(organism.structure?.nodes)) {
    for (let i = 0; i < organism.structure.nodes.length; i++) {
      const node = organism.structure.nodes[i];
      if (!node.id) errors.push(`structure.nodes[${i}].id is required`);
      if (node.type && !['action', 'decision', 'terminal', 'gate'].includes(node.type)) {
        errors.push(`structure.nodes[${i}].type must be one of: action, decision, terminal, gate`);
      }
    }
  }
  
  if (Array.isArray(organism.structure?.synapses)) {
    for (let i = 0; i < organism.structure.synapses.length; i++) {
      const synapse = organism.structure.synapses[i];
      if (!synapse.from) errors.push(`structure.synapses[${i}].from is required`);
      if (!synapse.to) errors.push(`structure.synapses[${i}].to is required`);
      if (!synapse.type) errors.push(`structure.synapses[${i}].type is required`);
      if (synapse.type && !['excitatory', 'inhibitory', 'modulatory'].includes(synapse.type)) {
        errors.push(`structure.synapses[${i}].type must be one of: excitatory, inhibitory, modulatory`);
      }
      if (synapse.weight != null && (synapse.weight < 0 || synapse.weight > 1)) {
        errors.push(`structure.synapses[${i}].weight must be between 0 and 1`);
      }
      if (synapse.lifecycle && !['active', 'weakened', 'dormant', 'candidate_for_pruning', 'pruned'].includes(synapse.lifecycle)) {
        errors.push(`structure.synapses[${i}].lifecycle invalid`);
      }
    }
  }
  
  if (organism.phenotype?.methylation) {
    for (let i = 0; i < organism.phenotype.methylation.length; i++) {
      const m = organism.phenotype.methylation[i];
      if (!m.target?.type) errors.push(`phenotype.methylation[${i}].target.type is required`);
      if (m.target?.type && !['synapse', 'procedure'].includes(m.target.type)) {
        errors.push(`phenotype.methylation[${i}].target.type must be synapse or procedure`);
      }
      if (m.type !== 'repression') errors.push(`phenotype.methylation[${i}].type must be repression`);
      if (m.strength == null || m.strength < 0 || m.strength > 1) {
        errors.push(`phenotype.methylation[${i}].strength must be between 0 and 1`);
      }
    }
  }
  
  if (organism.immune?.signatures) {
    for (let i = 0; i < organism.immune.signatures.length; i++) {
      const sig = organism.immune.signatures[i];
      if (!sig.id) errors.push(`immune.signatures[${i}].id is required`);
      if (sig.response?.gate && !['REJECT', 'ALLOW', 'QUARANTINE'].includes(sig.response.gate)) {
        errors.push(`immune.signatures[${i}].response.gate must be REJECT, ALLOW, or QUARANTINE`);
      }
    }
  }
  
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
