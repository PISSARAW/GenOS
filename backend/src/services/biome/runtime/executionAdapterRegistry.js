'use strict';

const providers = new Map();

function registerProvider(id, adapter) {
  if (typeof id !== 'string' || !id.trim() || providers.has(id)) throw new Error('A unique Biome provider identity is required.');
  const functions = ['execute', 'authorize', 'verify'];
  if (functions.some(key => typeof adapter?.[key] !== 'function')) {
    throw new Error('Biome providers require execute, authorize and verify functions.');
  }
  providers.set(id, Object.freeze({ ...adapter }));
  return () => providers.delete(id);
}

function resolveOptions(providerId, options = {}) {
  const configured = providers.get(providerId);
  return { ...options, executors: { ...options.executors,
    [providerId]: options.executors?.[providerId] || configured?.execute },
    authorizeExecution: options.authorizeExecution || configured?.authorize,
    verifyExecution: options.verifyExecution || configured?.verify };
}

module.exports = { registerProvider, resolveOptions };
