'use strict';

const assert = require('node:assert/strict');
const { measureCapabilityCoverage } = require('../src/services/aTeam/capabilities/capabilityCoverageService');
const { findCapabilityGaps } = require('../src/services/aTeam/capabilities/capabilityGapService');

const requirements = ['api', 'frontend', 'security', 'data', 'quality', 'operations', 'ai'].map((capability) => ({
  capability, name: capability, weight: 1, criticality: 'normal', evidenceRequired: true
}));
const members = requirements.slice(0, 3).map((item) => ({ capabilities: [item.capability] }));
const coverage = measureCapabilityCoverage({ requirements, members, analysisCoverage: 1 });
assert.equal(coverage.missionCoverage.ratio, 1);
assert.equal(coverage.staffedCoverage.ratio, 0.429);
assert.equal(coverage.ratio, 0.429);
assert.equal(coverage.runtimeToolCoverage.ratio, null);
assert.equal(coverage.verifiedCoverage.ratio, 0);
assert.deepEqual(findCapabilityGaps(requirements, members).map((gap) => gap.capability), ['data', 'quality', 'operations', 'ai']);

const runtime = measureCapabilityCoverage({
  requirements: [requirements[0]],
  members: [{ capabilities: ['api'], availableTools: ['api'] }],
  analysisCoverage: 1
});
assert.equal(runtime.runtimeToolCoverage.ratio, 1);
console.log('A-Team capability coverage: OK');
