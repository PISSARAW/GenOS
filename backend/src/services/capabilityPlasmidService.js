'use strict';

function createPlasmid(capability, contract = {}) {
  if (!capability) throw new Error('Capability plasmid requires a capability.');
  return {
    id: `plasmid-${String(capability).replace(/[^a-z0-9_-]/gi, '-')}`,
    capability,
    contractHash: contract.hash || null,
    tests: Array.isArray(contract.tests) ? contract.tests : [],
    permissions: Array.isArray(contract.permissions) ? contract.permissions : [],
    provenance: contract.provenance || null
  };
}

function assimilate(agent, plasmid) {
  if (!plasmid?.capability || !plasmid.contractHash || !plasmid.tests.length) {
    throw new Error('Capability plasmid requires a signed contract and tests.');
  }
  return {
    ...agent,
    capabilities: [...new Set([...(agent.capabilities || []), plasmid.capability])],
    plasmids: [...(agent.plasmids || []), plasmid.id]
  };
}

module.exports = { createPlasmid, assimilate };
