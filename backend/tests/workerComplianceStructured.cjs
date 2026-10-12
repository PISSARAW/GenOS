'use strict';

const ENABLED = Object.freeze({
  adaptive_worker: 'ADAPTIVE', specialist: 'SPECIALIST', symbiotic_worker: 'SYMBIOTIC',
  creative_worker: 'CREATIVE', medical_worker: 'MEDICAL'
});

function method(kind) {
  if (!enabled(kind)) return null;
  if (kind === 'adaptive_worker') return adaptive();
  if (kind === 'specialist') return { version: 1, methodId: 'niche_procedure', parameters: {
    niche: 'scheduling', procedure: subsetProcedure() } };
  if (kind === 'symbiotic_worker') return { version: 1, methodId: 'host_procedure', parameters: {
    capability: 'deterministic_procedure', procedure: subsetProcedure() } };
  if (kind === 'creative_worker') return creative();
  return medical();
}

function enabled(kind) {
  const flag = ENABLED[kind];
  return flag && process.env[`GENOS_COMPLIANCE_DETERMINISTIC_${flag}`] === '1';
}

function adaptive() {
  const procedure = { version: 1, methodId: 'lpt', parameters: {
    jobs: [{ id: 'A', duration: 5 }, { id: 'B', duration: 4 }, { id: 'C', duration: 3 }], machines: 2 } };
  return { version: 1, methodId: 'adapt_procedure', parameters: { trials: [
    { strategy: 'controlled_probe', procedure }, { strategy: 'causal_bisection', procedure }
  ] } };
}

function subsetProcedure() {
  return { version: 1, methodId: 'subset_sum', parameters: { values: [3, 5, 7], target: 10 } };
}

function creative() {
  return { version: 1, methodId: 'combine_candidates', parameters: {
    dimensions: [{ name: 'Claim', options: ['2 is even', '2 is divisible by 2'] },
      { name: 'Reason', options: ['remainder zero', 'pair grouping'] }],
    assumptions: ['The integer domain is conventional.'], falsificationTest: 'Check 2 modulo 2.',
    sourceRefs: ['test://worker-compliance/creative_worker/claim',
      'test://worker-compliance/creative_worker/reason',
      'test://worker-compliance/creative_worker/candidate'],
    goal: 'Support the claim with an explicit arithmetic reason.', evidence: [
      { dimension: 'Claim', option: '2 is even', goalCue: 'claim',
        sourceRef: 'test://worker-compliance/creative_worker/claim' },
      { dimension: 'Reason', option: 'remainder zero', goalCue: 'arithmetic reason',
        sourceRef: 'test://worker-compliance/creative_worker/reason' }
    ] } };
}

function medical() {
  return { version: 1, methodId: 'review_synthetic_case', parameters: {
    caseScope: 'synthetic_educational', vignette: 'Fictional headache after poor sleep.',
    considerations: [{ consideration: 'Sleep loss can accompany headache.',
      sourceRef: 'fixture://worker-compliance/medical_worker/synthetic-vignette' }],
    uncertainty: 'A vignette does not establish a cause.' } };
}

function references(kind, report, scenario) {
  const content = report?.workerArtifact?.content;
  if (kind === 'adaptive_worker') return content?.trialReceipts?.length === 2
    && content.trialReceipts.every((receipt) => solverRef(receipt.id));
  if (kind === 'specialist' || kind === 'symbiotic_worker') return solverRef(content?.procedureReceipt?.id);
  const refs = report?.workerArtifact?.provenance?.sourceRefs || [];
  return refs.includes(scenario.sourceRef) && (kind !== 'medical_worker'
    || content?.caseScope === 'synthetic_educational');
}

function hostCapabilities(kind) {
  return kind === 'symbiotic_worker' && enabled(kind)
    ? ['host_bound', 'deterministic_procedure'] : ['host_bound'];
}

function solverRef(value) { return /^solver:\/\/sha256:[a-f0-9]{64}$/.test(value || ''); }

module.exports = { method, enabled, references, hostCapabilities };
