'use strict';

const CAPABILITY_MATURITY = Object.freeze({
  cas_gc: 'implemented',
  dag_mark_sweep: 'implemented',
  genos_blame: 'implemented',
  genos_lineage: 'implemented',
  replicate: 'heuristic',
  alternate_genome: 'heuristic',
  decoy_branch: 'heuristic',
  observe: 'heuristic',
  phenotype_evidence: 'heuristic',
  promote_trait: 'partial',
  speciate: 'partial',
  graft: 'partial',
});

function getCapabilityMaturity(name) {
  return CAPABILITY_MATURITY[name] || 'implemented';
}

function annotateCapability(name, result) {
  return { ...result, capability: name, maturity: getCapabilityMaturity(name), verified: getCapabilityMaturity(name) === 'implemented' };
}

module.exports = { CAPABILITY_MATURITY, getCapabilityMaturity, annotateCapability };
