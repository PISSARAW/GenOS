'use strict';

const plasmids = require('./capabilityPlasmidService');
const gates = require('./morphogenesis/plasmidGateService');

function gateView(plasmid) {
  const source = plasmid || {};
  return {
    id: source.id,
    capability: source.capability,
    code: JSON.stringify({ capability: source.capability, tests: source.tests, contractHash: source.contractHash }),
    requiredTools: Array.isArray(source.permissions) ? source.permissions : [],
    requiredAuthority: source.requiredAuthority || 'execute'
  };
}

function recipientView(agent) {
  const source = agent || {};
  const installed = Array.isArray(source.capabilities) ? source.capabilities : [];
  const expressible = Array.isArray(source.expressible) ? source.expressible : installed;
  const expressibleSet = new Set(expressible);
  return {
    id: source.id || null,
    phenotype: source.phenotype || source.phenotypeId || 'AdaptiveWorker',
    capabilities: installed,
    canExpress: (capability) => expressibleSet.has(capability),
    authorityProfile: source.authorityProfile || { execute: true },
    immuneStatus: source.immuneStatus || 'clear',
    immuneRejections: source.immuneRejections || [],
    toolLease: Array.isArray(source.toolLease) ? source.toolLease : []
  };
}

function installPlasmid(agent, plasmid) {
  const evaluation = gates.evaluateAllGates(gateView(plasmid), recipientView(agent));
  if (!evaluation.passed) {
    return { installed: false, evaluation, agent };
  }
  gates.transitionStatus(plasmid.id, 'leased', 'install: gates passed');
  gates.transitionStatus(plasmid.id, 'assimilated', 'install: capability expressed');
  const next = plasmids.assimilate(agent, plasmid);
  return {
    installed: true,
    evaluation,
    agent: { ...next, plasmidsHistory: gates.getPlasmidHistory(plasmid.id) }
  };
}

function rollbackPlasmid(agent, plasmid) {
  const source = agent || {};
  const id = plasmid && plasmid.id;
  const capability = plasmid && plasmid.capability;
  const capabilities = Array.isArray(source.capabilities) ? source.capabilities.filter((c) => c !== capability) : [];
  const installed = Array.isArray(source.plasmids) ? source.plasmids.filter((p) => p !== id) : [];
  if (id) gates.transitionStatus(id, 'disabled', 'rollback: capability removed');
  return { rolledBack: true, agent: { ...source, capabilities, plasmids: installed } };
}

module.exports = { gateView, recipientView, installPlasmid, rollbackPlasmid };
