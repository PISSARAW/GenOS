'use strict';

const crypto = require('node:crypto');

function validateList(value, field) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`${field} must be an array of non-empty strings.`);
  }
  return [...new Set(value)];
}

function contractPayload(capability, contract) {
  return {
    capability,
    tests: validateList(contract.tests, 'tests'),
    permissions: validateList(contract.permissions || [], 'permissions'),
    provenance: contract.provenance || null
  };
}

function hashPayload(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function createPlasmid(capability, contract = {}) {
  if (typeof capability !== 'string' || !capability.trim()) throw new Error('Capability plasmid requires a capability.');
  const payload = contractPayload(capability, { ...contract, tests: contract.tests || [] });
  const contractHash = hashPayload(payload);
  if (contract.hash && contract.hash !== contractHash) throw new Error('Capability contract hash does not match its contents.');
  return {
    id: `plasmid-${capability.replace(/[^a-z0-9_-]/gi, '-')}-${contractHash.slice(0, 12)}`,
    ...payload,
    contractHash
  };
}

function assimilate(agent, plasmid) {
  if (!agent || typeof agent !== 'object' || !plasmid?.id || !plasmid.capability) {
    throw new Error('Agent and capability plasmid are required.');
  }
  const payload = contractPayload(plasmid.capability, plasmid);
  if (!payload.tests.length || hashPayload(payload) !== plasmid.contractHash) {
    throw new Error('Capability plasmid requires an intact contract and tests.');
  }
  const capabilities = Array.isArray(agent.capabilities) ? agent.capabilities : [];
  const plasmids = Array.isArray(agent.plasmids) ? agent.plasmids : [];
  return {
    ...agent,
    capabilities: [...new Set([...capabilities, plasmid.capability])],
    plasmids: plasmids.includes(plasmid.id) ? [...plasmids] : [...plasmids, plasmid.id]
  };
}

module.exports = { createPlasmid, assimilate };
