'use strict';

const { createDependencyGraph } = require('./dependencyGraph');
const { intersectAuthority } = require('./authorityIntersection');
const { buildLockfile } = require('./lockfileBuilder');

function resolveProjectInheritance({ manifest, registry, projectAuthority, resolvedAt }) {
  const graph = createDependencyGraph({ requested: manifest.inherit, registry });
  const requests = new Map(manifest.inherit.map((entry) => [`${entry.capability}@${entry.version}`, entry]));
  const resolved = graph.map((descriptor) => resolveDescriptor({ descriptor, requests, projectAuthority }));
  const denied = resolved.filter((entry) => entry.denied.length);
  if (denied.length) {
    const error = new Error(`Insufficient project authority: ${denied.map((entry) => entry.capabilityId).join(', ')}`);
    error.code = 'GCI_AUTHORITY_DENIED';
    error.details = denied.map(({ capabilityId, denied: deniedPermissions }) => ({ capabilityId, denied: deniedPermissions }));
    throw error;
  }
  return buildLockfile({
    projectId: manifest.project.id, environment: manifest.project.environment,
    capabilities: resolved.map(({ denied: _denied, ...item }) => item), resolvedAt
  });
}

function resolveDescriptor({ descriptor, requests, projectAuthority }) {
  const request = requests.get(`${descriptor.capabilityId}@${descriptor.version}`);
  const requested = new Set(request ? request.permissions : descriptor.requiredAuthority);
  const intersection = intersectAuthority([...requested], projectAuthority);
  const declared = new Set(descriptor.requiredAuthority);
  const denied = [...intersection.denied, ...[...requested].filter((permission) => !declared.has(permission))];
  const actual = intersection.allowed.filter((permission) => declared.has(permission));
  if (!descriptor.exportModes.includes(request ? request.mode : 'linked')) denied.push(`mode:${request ? request.mode : 'linked'}`);
  return {
    capabilityId: descriptor.capabilityId, version: descriptor.version,
    implementationDigest: descriptor.implementationDigest, provider: descriptor.provider,
    mode: request ? request.mode : 'linked', effectiveAuthority: actual,
    dependencies: descriptor.dependencies, denied: [...new Set(denied)].sort()
  };
}

module.exports = { resolveProjectInheritance };
