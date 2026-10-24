'use strict';

const assert = require('node:assert/strict');
const { createExportRegistry } = require('../src/services/capabilityInheritance/catalog/exportRegistry');

const descriptor = {
  schema: 'genos.gci.capability/v1', capabilityId: 'MODEL_ROUTING', version: '1.0.0',
  implementationDigest: `sha256:${'a'.repeat(64)}`, provider: { id: 'genos' }, maturity: 'integrated',
  exportModes: ['linked'], inputContract: {}, outputContract: {}, requiredAuthority: ['route:read'],
  dependencies: [], constraints: {}, sideEffects: [], evidence: [], revocationPolicy: { revocable: true }
};
const registry = createExportRegistry({ descriptors: [descriptor], capabilityGraph: { MODEL_ROUTING: { id: 'MODEL_ROUTING', category: 'capability' } }, accessFor: () => ({ level: 'mcp_tool' }) });
assert.equal(registry.listExports().length, 1);
assert.equal(registry.inspect('MODEL_ROUTING', '1.0.0').access.level, 'mcp_tool');
assert.equal(registry.inspect('unknown', '1.0.0'), null);
assert.throws(() => createExportRegistry({ descriptors: [descriptor], capabilityGraph: {} }), /Unknown GenOS capability/);
assert.throws(() => createExportRegistry({ descriptors: [{ ...descriptor, implementationDigest: 'mutable' }], capabilityGraph: { MODEL_ROUTING: { id: 'MODEL_ROUTING', category: 'capability' } } }), /sha256 digest/);
assert.equal(registry.listExports().length, 1, 'registry projection is read only');
assert.throws(() => { registry.inspect('MODEL_ROUTING', '1.0.0').inputContract.x = true; }, TypeError);
assert.equal(createExportRegistry({ capabilityGraph: {} }).listExports().length, 0, 'nothing is exportable by default');
console.log('GCI export registry: ok');
