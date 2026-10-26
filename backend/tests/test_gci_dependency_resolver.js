'use strict';

const assert = require('node:assert/strict');
const { createExportRegistry } = require('../src/services/capabilityInheritance/catalog/exportRegistry');
const { resolveProjectInheritance } = require('../src/services/capabilityInheritance/resolver/compatibilityResolver');

function descriptor(capabilityId, dependencies = [], requiredAuthority = ['repo:read']) {
  return { schema: 'genos.gci.capability/v1', capabilityId, version: '1.0.0',
    implementationDigest: `sha256:${'a'.repeat(64)}`, provider: { id: 'genos' }, maturity: 'integrated',
    exportModes: ['linked'], inputContract: {}, outputContract: {}, requiredAuthority,
    dependencies, constraints: {}, sideEffects: [], evidence: [], revocationPolicy: { revocable: true } };
}
function registryFor(descriptors) {
  return createExportRegistry({ descriptors,
    capabilityGraph: Object.fromEntries(descriptors.map((entry) => [entry.capabilityId, { id: entry.capabilityId, category: 'capability' }])) });
}
const dep = descriptor('base.capability');
const root = descriptor('app.capability', [{ capabilityId: dep.capabilityId, version: dep.version }]);
const manifest = { project: { id: 'app', environment: 'test' }, inherit: [{ capability: root.capabilityId, version: root.version, mode: 'linked', permissions: ['repo:read'] }] };
const lock = resolveProjectInheritance({ manifest, registry: registryFor([root, dep]), projectAuthority: ['repo:read'], resolvedAt: '2026-01-01T00:00:00.000Z' });
assert.deepEqual(lock.capabilities.map((entry) => entry.capabilityId), ['app.capability', 'base.capability']);
assert.equal(lock.capabilities[1].effectiveAuthority[0], 'repo:read');
assert.match(lock.graphDigest, /^sha256:[a-f0-9]{64}$/);
assert.throws(() => resolveProjectInheritance({ manifest, registry: registryFor([root]), projectAuthority: ['repo:read'] }), { code: 'GCI_DEPENDENCY_MISSING' });
assert.throws(() => resolveProjectInheritance({ manifest, registry: registryFor([root, dep]), projectAuthority: [] }), { code: 'GCI_AUTHORITY_DENIED' });
assert.throws(() => resolveProjectInheritance({ manifest, registry: registryFor([root, dep]),
  projectAuthority: { 'app.capability': ['repo:read'], 'base.capability': [] } }), { code: 'GCI_AUTHORITY_DENIED' });
const partial = { ...manifest, inherit: [{ ...manifest.inherit[0], permissions: [] }] };
const independent = descriptor(root.capabilityId, []);
assert.equal(resolveProjectInheritance({ manifest: partial, registry: registryFor([independent]), projectAuthority: [] }).capabilities[0].effectiveAuthority.length, 0);
const cyclic = descriptor('cycle.capability', [{ capabilityId: 'cycle.capability', version: '1.0.0' }]);
assert.throws(() => resolveProjectInheritance({ manifest: { ...manifest, inherit: [{ ...manifest.inherit[0], capability: cyclic.capabilityId }] }, registry: registryFor([cyclic]), projectAuthority: ['repo:read'] }), { code: 'GCI_DEPENDENCY_CYCLE' });
console.log('GCI dependency resolver: ok');
