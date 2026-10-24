'use strict';

const { createHash } = require('node:crypto');

function buildLockfile({ projectId, environment, capabilities, resolvedAt = '1970-01-01T00:00:00.000Z' }) {
  const entries = capabilities.map((item) => ({
    capabilityId: item.capabilityId,
    version: item.version,
    implementationDigest: item.implementationDigest,
    provider: item.provider.id,
    mode: item.mode,
    effectiveAuthority: [...item.effectiveAuthority].sort(),
    dependencies: item.dependencies.map((dependency) => `${dependency.capabilityId}@${dependency.version}`).sort()
  })).sort((a, b) => a.capabilityId.localeCompare(b.capabilityId) || a.version.localeCompare(b.version));
  const canonical = JSON.stringify({ projectId, environment, capabilities: entries });
  const graphDigest = `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
  return Object.freeze({ schema: 'genos.gci.lockfile/v1', projectId, environment, resolvedAt, graphDigest, capabilities: entries });
}

module.exports = { buildLockfile };
