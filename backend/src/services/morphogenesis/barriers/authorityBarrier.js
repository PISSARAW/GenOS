'use strict';

const COMPATIBLE_STRUCTURES = Object.freeze({
  centralized: ['hierarchical'],
  hierarchical: ['centralized', 'rotating'],
  democratic: ['meritocratic'],
  meritocratic: ['democratic'],
  rotating: ['hierarchical'],
  coordinator_directed: ['hierarchical', 'centralized', 'host_veto'],
  host_veto: ['coordinator_directed', 'hierarchical', 'centralized'],
  quorum: ['democratic', 'meritocratic', 'local_with_quorum'],
  local_with_quorum: ['quorum', 'decentralized', 'distributed'],
  distributed: ['decentralized', 'local_with_quorum'],
  decentralized: ['distributed', 'local_with_quorum'],
  evidence_gated: ['hierarchical', 'quorum', 'coordinator_directed', 'invariant_constrained'],
  invariant_constrained: ['evidence_gated', 'hierarchical']
});

function structureOf(contract) {
  if (typeof contract === 'string') return contract;
  const model = contract && contract.authorityModel;
  if (typeof model === 'string') return model;
  return (model && (model.structure || model.decision)) || null;
}

function isCompatible(parentStructure, childStructure) {
  const parent = String(parentStructure || '').toLowerCase();
  const child = String(childStructure || '').toLowerCase();
  if (!parent || !child) return false;
  if (parent === child) return true;
  const allowed = COMPATIBLE_STRUCTURES[parent];
  return Array.isArray(allowed) && allowed.includes(child);
}

function check(parentContract, childContract) {
  const parentStructure = structureOf(parentContract);
  const childStructure = structureOf(childContract);
  if (!parentStructure || !childStructure) {
    return { valid: false, reason: 'authority model structure is missing on one side' };
  }
  if (!isCompatible(parentStructure, childStructure)) {
    return { valid: false, reason: `authority structures incompatible: ${parentStructure} <-> ${childStructure}` };
  }
  return { valid: true };
}

module.exports = { COMPATIBLE_STRUCTURES, isCompatible, check };
