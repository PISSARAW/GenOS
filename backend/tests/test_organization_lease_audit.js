const assert = require('node:assert/strict');
const dynamicOrganization = require('../src/services/dynamicOrganizationService');
const topology = require('../src/services/topologyCapabilityService');
const leases = require('../src/services/toolLeasePolicy');

const NO_TOOL_CAPABILITIES = new Set([
  'SWARM_METRICS', 'CONSCIENCE_HOMEOSTASIS', 'CHAOS_ENGINEERING', 'MODEL_ROUTING',
  'LOCAL_INFERENCE', 'INFERENCE_GATEWAY', 'COMPLIANCE'
]);

const names = Object.keys(dynamicOrganization.ORGANIZATIONS);
assert.ok(names.length >= 19, 'all organizations must be present');

const allow = new Set(leases.KNOWN_TOOL_ALLOW_LIST);
for (const name of names) {
  const entry = topology.capabilitiesForOrganization(name);
  assert.ok(entry && entry.required.length > 0, `${name} must declare capabilities`);
  const widened = leases.leaseForCapabilities([], entry.required);
  for (const tool of widened) {
    assert.ok(allow.has(tool), `${name}: leased tool ${tool} must stay in allow-list`);
    assert.ok(!leases.isOrchestrateVariant(tool), `${name}: lease must never reintroduce orchestrate`);
  }
  const mapped = new Set();
  for (const capability of entry.required) {
    for (const tool of (leases.CAPABILITY_TOOLS[capability] || [])) mapped.add(tool);
  }
  const unmapped = entry.required.filter((capability) => !NO_TOOL_CAPABILITIES.has(capability) && (leases.CAPABILITY_TOOLS[capability] || []).length === 0);
  assert.deepEqual(unmapped, [], `${name}: unexpected capability without tool mapping`);
}

console.log('Organization lease audit: PASS');
