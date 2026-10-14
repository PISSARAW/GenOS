const assert = require('node:assert/strict');
const adaptive = require('../src/services/adaptiveReevaluationService');
const topology = require('../src/services/topologyCapabilityService');

const context = { mode: 'trinity', currentTopology: { organization: 'network_silence' } };
const modes = Object.keys(topology.MODE_CAPABILITIES);
const falseCoverage = adaptive.findBetterTopology('network_silence', ['EVIDENCE_BARRIER'], context);
assert.equal(falseCoverage, null, 'unavailable candidate requirements must not count as covered');

const organizationRequirements = topology.capabilitiesForOrganization('network_silence').required;
const biomeRequirements = topology.capabilitiesForMode('biome').required.concat(organizationRequirements);
const viable = adaptive.findBetterTopology('network_silence', biomeRequirements, context);
assert.equal(viable.mode, 'biome');
assert.ok(viable.coverage > 0);
assert.ok(viable.requirementsResolved.length > 0);
assert.notEqual(viable.mode, context.mode, 'reevaluation must not recommend the current mode');

const unverifiedRemediation = adaptive.findBetterTopology('network_silence', ['EVIDENCE_BARRIER'], {
  ...context,
  remediatedCapabilities: biomeRequirements,
});
assert.equal(unverifiedRemediation, null, 'unverified remediation claims must not make a candidate admissible');

const missingRemediation = adaptive.findBetterTopology('network_silence', ['EVIDENCE_BARRIER'], context);
assert.equal(missingRemediation, null, 'without remediation a candidate with missing requirements is inadmissible');

for (const mode of modes) {
  const available = topology.capabilitiesForMode(mode).required.concat(organizationRequirements);
  const candidate = adaptive.findBetterTopology('network_silence', available, context);
  if (!candidate) continue;
  const required = topology.contractFor({ mode: candidate.mode, organization: 'network_silence' }).required;
  assert.ok(required.every((capability) => available.includes(capability)),
    `${candidate.mode} must be admissible from the supplied capabilities`);
  assert.notEqual(candidate.mode, context.mode, 'a mode cannot recommend itself');
}

console.log('Adaptive topology capability reevaluation checks: PASS');
