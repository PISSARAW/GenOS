const assert = require('node:assert/strict');
const dynamicOrganization = require('../src/services/dynamicOrganizationService');
const topology = require('../src/services/topologyCapabilityService');

const names = Object.keys(dynamicOrganization.ORGANIZATIONS);
assert.ok(names.length >= 19, 'all organizations must be present');
for (const name of names) {
  const entry = topology.capabilitiesForOrganization(name);
  assert.ok(entry, `organization ${name} must declare capabilities`);
  assert.ok(entry.required.length > 0, `organization ${name} must require capabilities`);
}

assert.ok(topology.capabilitiesForOrganization('brier_weighted_consensus').required.includes('EPISTEMICS_BRIER'));
assert.ok(topology.capabilitiesForOrganization('stigmergy').required.includes('STIGMERGY'));
assert.ok(topology.capabilitiesForOrganization('memory_compilation').required.includes('GRAPH_MEMORY'));

console.log('Organization capability parity checks: PASS');
