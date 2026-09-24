'use strict';

const COMPENSATIONS = Object.freeze({
  'a-team:interface_churn': 'local_syncytium',
  'syncytium:correlated_reasoning': 'independent_trinity_verifier',
  'rhizome:excessive_growth': 'biome_resource_regulator',
  'holobionte:single_symbiont_dependency': 'metapopulation_redundancy'
});

function proposeWeaknessCompensation(input = {}) {
  const key = `${String(input.topology || '').toLowerCase()}:${String(input.failure || '').toLowerCase()}`;
  return { proposal: COMPENSATIONS[key] || null, automaticTransformation: false, requiresDiagnostic: true };
}

module.exports = { COMPENSATIONS, proposeWeaknessCompensation };
