'use strict';

const KNOWN_MODES = new Set([
  'a_team', 'biocenose', 'biome', 'holobionte', 'metapopulation',
  'rhizome', 'syncytium', 'trinity'
]);

function optionalApplier(mode) {
  if (!KNOWN_MODES.has(mode)) return null;
  try {
    return require(`./topologyResultAppliers/${mode}.cjs`);
  } catch (error) {
    const expected = `topologyResultAppliers/${mode}.cjs`;
    if (error.code === 'MODULE_NOT_FOUND' && String(error.message).includes(expected)) return null;
    throw error;
  }
}

function builtInApplier(mode) {
  if (mode !== 'rhizome') return null;
  return { apply: require('./rhizomeResultsApplier.cjs').applyRhizomeResults };
}

function resolveApplier(mode, overrides = {}) {
  return overrides[mode] || optionalApplier(mode) || builtInApplier(mode);
}

async function applyTopologyResults(input, overrides = {}) {
  const mode = String(input?.mode || '').trim().toLowerCase();
  const applier = resolveApplier(mode, overrides);
  if (!applier || typeof applier.apply !== 'function') {
    return { applied: false, status: 'BLOCKED',
      reason: 'TOPOLOGY_RESULT_APPLIER_UNAVAILABLE', mode };
  }
  const result = await applier.apply(input);
  return { applied: true, status: 'APPLIED', mode, ...(result || {}) };
}

module.exports = { applyTopologyResults, resolveApplier };
