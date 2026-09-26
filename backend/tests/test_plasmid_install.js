'use strict';

const assert = require('node:assert/strict');
const plasmids = require('../src/services/capabilityPlasmidService');
const install = require('../src/services/plasmidInstallService');

function makePlasmid() {
  return plasmids.createPlasmid('web_extract', {
    tests: ['contract holds under replay'],
    permissions: ['genos_browser_act'],
    provenance: 'test-suite'
  });
}

function makeAgent() {
  return {
    id: 'agent-1',
    phenotype: 'AdaptiveWorker',
    capabilities: [],
    expressible: ['web_extract'],
    plasmids: [],
    authorityProfile: { execute: true },
    immuneStatus: 'clear',
    toolLease: ['genos_browser_act']
  };
}

function verifyInstallExpresses() {
  const plasmid = makePlasmid();
  const result = install.installPlasmid(makeAgent(), plasmid);
  assert.equal(result.installed, true);
  assert.equal(result.evaluation.passed, true);
  assert.ok(result.agent.capabilities.includes('web_extract'));
  assert.ok(result.agent.plasmids.includes(plasmid.id));
}

function verifyGateBlocksLease() {
  const plasmid = makePlasmid();
  const agent = { ...makeAgent(), toolLease: [] };
  const result = install.installPlasmid(agent, plasmid);
  assert.equal(result.installed, false);
  assert.ok(result.agent.capabilities.includes('web_extract') === false);
  assert.ok(result.evaluation.gates.lease.allowed === false);
}

function verifyRollbackRemoves() {
  const plasmid = makePlasmid();
  const installed = install.installPlasmid(makeAgent(), plasmid);
  assert.equal(installed.installed, true);
  const rolled = install.rollbackPlasmid(installed.agent, plasmid);
  assert.equal(rolled.rolledBack, true);
  assert.ok(rolled.agent.capabilities.includes('web_extract') === false);
  assert.ok(rolled.agent.plasmids.includes(plasmid.id) === false);
}

verifyInstallExpresses();
verifyGateBlocksLease();
verifyRollbackRemoves();
console.log('Plasmid install tests passed.');
