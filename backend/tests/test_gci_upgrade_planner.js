'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createExportRegistry } = require('../src/services/capabilityInheritance/catalog/exportRegistry');
const { resolveProjectInheritance } = require('../src/services/capabilityInheritance/resolver/compatibilityResolver');
const { planUpgrade, compareVersions } = require('../src/services/capabilityInheritance/evolution/upgradePlanner');
const { apiPath } = require('../bin/genos-gci.cjs');

function main() {
  const manifest = projectManifest();
  const oldRegistry = registry([descriptor({ capabilityId: 'gci.echo', version: '1.0.0', requiredAuthority: ['echo:run'] }),
    descriptor({ capabilityId: 'gci.base', version: '1.0.0', requiredAuthority: ['base:read'] })]);
  const currentLockfile = resolveProjectInheritance({ manifest, registry: oldRegistry,
    projectAuthority: ['echo:run', 'base:read'], resolvedAt: '2026-01-01T00:00:00.000Z' });
  const latestRegistry = registry([
    descriptor({ capabilityId: 'gci.echo', version: '1.0.0', requiredAuthority: ['echo:run'] }),
    descriptor({ capabilityId: 'gci.echo', version: '2.0.0', dependencies: [{ capabilityId: 'gci.base', version: '1.1.0' }], requiredAuthority: ['echo:run'] }),
    descriptor({ capabilityId: 'gci.echo', version: '1.5.0', requiredAuthority: ['echo:run'] }),
    descriptor({ capabilityId: 'gci.base', version: '1.0.0', requiredAuthority: ['base:read'] }),
    descriptor({ capabilityId: 'gci.base', version: '1.1.0', requiredAuthority: ['base:read'] })
  ]);
  const planned = planUpgrade({ manifest, currentLockfile, registry: latestRegistry,
    projectAuthority: ['echo:run', 'base:read'], resolvedAt: '2026-01-02T00:00:00.000Z' });
  assert.equal(planned.status, 'resolved');
  assert.equal(planned.lockfile.capabilities.find((item) => item.capabilityId === 'gci.echo').version, '2.0.0');
  assert.equal(planned.changes.length, 2);
  assert.equal(planned.requiresIndependentVerification, true);
  assert.equal(planned.automaticMerge, false);
  const unchanged = planUpgrade({ manifest, currentLockfile, registry: oldRegistry,
    projectAuthority: ['echo:run', 'base:read'], resolvedAt: '2026-01-02T00:00:00.000Z' });
  assert.equal(unchanged.status, 'no_change');
  assert.deepEqual(compareVersions('2.0.0-rc.1', '2.0.0'), -1);
  assert.deepEqual(compareVersions('2.0.0+build.2', '2.0.0'), 0);
  assert.equal(apiPath('upgrade', 'project-a'), '/projects/project-a/upgrades/plan');
  assert.throws(() => planUpgrade({ manifest: projectManifest('9.0.0'), currentLockfile,
    registry: latestRegistry, projectAuthority: ['echo:run'], resolvedAt: '2026-01-02T00:00:00.000Z' }),
  { code: 'GCI_UPGRADE_SOURCE_STALE' });
  assert.throws(() => planUpgrade({ manifest, currentLockfile, registry: latestRegistry,
    projectAuthority: ['echo:run'], resolvedAt: '2026-01-02T00:00:00.000Z' }), { code: 'GCI_AUTHORITY_DENIED' });
  console.log('GCI upgrade planner: ok');
}

function projectManifest(version = '1.0.0') {
  return { schema: 'genos.gci.project/v1', project: { id: 'project-a', environment: 'test' },
    provider: { id: 'genos' }, inherit: [{ capability: 'gci.echo', mode: 'linked', version, permissions: ['echo:run'] }] };
}

function registry(descriptors) {
  return createExportRegistry({ descriptors,
    capabilityGraph: { 'gci.echo': { id: 'gci.echo', category: 'capability' },
      'gci.base': { id: 'gci.base', category: 'capability' } } });
}

function descriptor(input) {
  return { schema: 'genos.gci.capability/v1', capabilityId: input.capabilityId, version: input.version,
    implementationDigest: `sha256:${createHash('sha256').update(`${input.capabilityId}@${input.version}`).digest('hex')}`,
    provider: { id: 'genos' }, maturity: 'verified', exportModes: ['linked'], inputContract: {}, outputContract: {},
    requiredAuthority: input.requiredAuthority, dependencies: input.dependencies || [],
    constraints: {}, sideEffects: [], evidence: [], revocationPolicy: { revocable: true } };
}

main();
