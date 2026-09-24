'use strict';

const { createEnvironment } = require('../contracts/environment');

function versionEnvironment(input = {}) {
  const current = input.environment || {};
  const patch = input.patch || {};
  const environment = createEnvironment({
    ...current,
    ...patch,
    environmentId: current.environmentId,
    version: Number(current.version || 0) + 1
  });
  return {
    environment,
    receipt: {
      previousVersion: current.version || 0,
      resultingVersion: environment.version,
      reason: String(input.reason || 'environment update'),
      changedFields: Object.keys(patch).sort(),
      evidenceRefs: Array.isArray(input.evidenceRefs) ? input.evidenceRefs.filter(Boolean) : []
    }
  };
}

module.exports = { versionEnvironment };
