'use strict';

const POLICIES = Object.freeze({
  epistemic_jury: { disclosure: 'sealed', review: 'specialized', aggregation: 'evidence_first', dissent: 'preserve_material' },
  delphi: { disclosure: 'anonymous_rounds', review: 'anonymous_arguments', aggregation: 'calibrated_distribution', dissent: 'preserve_minorities' },
  adversarial_assembly: { disclosure: 'sealed', review: 'adversarial', aggregation: 'verified_evidence_first', dissent: 'counterexample_veto' }
});

function select(name) {
  const key = String(name || 'epistemic_jury').toLowerCase();
  if (!POLICIES[key]) throw Object.assign(new Error(`Unknown Biocenose variant '${key}'.`), { code: 'BIOCENOSE_VARIANT_UNKNOWN' });
  return { name: key, ...POLICIES[key] };
}

module.exports = { POLICIES, select };
