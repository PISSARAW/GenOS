'use strict';

const COMPATIBLE_STRUCTURES = {
  centralized: ['hierarchical'],
  hierarchical: ['centralized', 'rotating'],
  democratic: ['meritocratic'],
  meritocratic: ['democratic'],
  rotating: ['hierarchical']
};

function structureOf(contract) {
  return contract && contract.authorityModel && contract.authorityModel.structure;
}

function isCompatible(parentStructure, childStructure) {
  const allowed = COMPATIBLE_STRUCTURES[String(parentStructure).toLowerCase()];
  return Array.isArray(allowed) && allowed.includes(String(childStructure).toLowerCase());
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

module.exports = { check };
