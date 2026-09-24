const assert = require('node:assert/strict');
const topology = require('../src/services/topologyCapabilityService');

const KNOWN = new Set(topology.GENOS_CAPABILITIES);
const MODES = ['trinity', 'a_team', 'biome', 'biocenose', 'holobionte', 'syncytium', 'rhizome', 'metapopulation'];

for (const mode of MODES) {
  const entry = topology.capabilitiesForMode(mode);
  assert.ok(entry, `mode ${mode} must be declared`);
  assert.equal(entry.kind, 'mode');
  assert.ok(entry.required.length > 0, `mode ${mode} must require capabilities`);
  for (const capability of entry.required) assert.ok(KNOWN.has(capability), `${mode} references unknown ${capability}`);
  assert.ok(entry.profile && entry.profile.evidence && entry.profile.memory, `mode ${mode} must expose a profile`);
}

for (const organization of Object.keys(topology.ORGANIZATION_CAPABILITIES)) {
  const entry = topology.capabilitiesForOrganization(organization);
  assert.equal(entry.kind, 'organization');
  assert.ok(entry.required.length > 0, `organization ${organization} must require capabilities`);
  for (const capability of entry.required) assert.ok(KNOWN.has(capability), `${organization} references unknown ${capability}`);
}

const trinity = topology.capabilitiesForMode('trinity').required;
for (const capability of ['EVIDENCE_BARRIER', 'EPISTEMICS_BRIER', 'ARENA_COMPETITION', 'PROMOTION_GATE']) {
  assert.ok(trinity.includes(capability), `Trinity must require ${capability}`);
}
assert.ok(topology.capabilitiesForMode('syncytium').required.includes('CRDT_SHARED_STATE'));
assert.ok(topology.capabilitiesForMode('biocenose').required.includes('QUORUM'));
assert.ok(topology.capabilitiesForMode('holobionte').required.includes('LOCAL_INFERENCE'));
assert.ok(topology.capabilitiesForMode('a_team').required.includes('LIGAND_RECEPTOR'));

const contract = topology.contractFor({ mode: 'biocenose', organization: 'brier_weighted_consensus' });
assert.equal(contract.mode, 'biocenose');
assert.equal(contract.organization, 'brier_weighted_consensus');
assert.ok(contract.required.includes('EPISTEMICS_BRIER'));
assert.ok(contract.required.includes('QUORUM'));
assert.ok(contract.required.includes('ARENA_COMPETITION'));

const audit = topology.auditTopology({ mode: 'trinity', available: ['EVIDENCE_BARRIER', 'TOKEN_ECONOMY'] });
assert.deepEqual(audit.missing.includes('EVIDENCE_BARRIER'), false);
assert.ok(audit.missing.includes('ARENA_COMPETITION'));
assert.deepEqual(topology.capabilitiesForMode('unknown-mode'), null);
assert.deepEqual(topology.capabilitiesForOrganization('unknown-org'), null);

console.log('Topology capability contract checks: PASS');
