'use strict';

const { appendEvent } = require('./gvxDevelopmentLedger');

function validateAssessment(input) {
  const errors = [];
  if (!input || !input.baseline || !input.candidate || !input.profile) return ['comparison-input-required'];
  if (input.baseline.suiteHash !== input.candidate.suiteHash || !input.baseline.suiteHash) errors.push('matched-suite-required');
  if (!validEvidenceRefs(input.evidenceRefs)) errors.push('evidence-references-required');
  if (!validProfile(input.profile)) errors.push('assessment-rules-invalid');
  return errors;
}

function validEvidenceRefs(refs) {
  return Array.isArray(refs) && refs.length > 0 && refs.every((ref) => ref
    && /^[a-f0-9]{64}$/.test(ref.artifactHash || '') && typeof ref.verifierId === 'string' && ref.verifierId.trim());
}

function validProfile(profile) {
  return Number.isInteger(profile.minSamples) && profile.minSamples > 0
    && Array.isArray(profile.rules) && profile.rules.length > 0 && profile.rules.every(validRule);
}

function validRule(rule) {
  return rule && typeof rule.metric === 'string' && rule.metric.trim()
    && ['higher', 'lower', 'maintain'].includes(rule.objective)
    && Number.isFinite(rule.minImprovement) && rule.minImprovement >= 0
    && Number.isFinite(rule.maxRegression) && rule.maxRegression >= 0;
}

function evaluateMetric(input) {
  const { rule, baseline, candidate, minSamples } = input;
  const before = baseline.metrics?.[rule.metric];
  const after = candidate.metrics?.[rule.metric];
  if (!validEstimate(before, minSamples) || !validEstimate(after, minSamples)) {
    return { metric: rule.metric, status: 'unknown', reason: 'samples-insufficient' };
  }
  const delta = after.mean - before.mean;
  return metricResult(rule, delta);
}

function validEstimate(estimate, minSamples) {
  return Boolean(estimate && Number.isFinite(estimate.mean) && Number.isInteger(estimate.samples)
    && estimate.samples >= minSamples);
}

function metricResult(rule, delta) {
  const oriented = rule.objective === 'lower' ? -delta : delta;
  if (rule.objective === 'maintain') {
    const failed = delta < -rule.maxRegression || delta > rule.maxRegression;
    return { metric: rule.metric, status: failed ? 'regression' : 'maintained', delta };
  }
  if (oriented < -rule.maxRegression) return { metric: rule.metric, status: 'regression', delta };
  return { metric: rule.metric, status: oriented >= rule.minImprovement ? 'improved' : 'neutral', delta };
}

function assessSomaticCandidate(input) {
  const errors = validateAssessment(input);
  if (errors.length) throw Object.assign(new Error(errors.join(',')), { code: 'GVX_ASSESSMENT_INVALID', errors });
  const minSamples = input.profile.minSamples;
  const metrics = input.profile.rules.map((rule) => evaluateMetric({
    rule, baseline: input.baseline, candidate: input.candidate, minSamples
  }));
  const failed = metrics.some((item) => item.status === 'regression');
  const unknown = metrics.some((item) => item.status === 'unknown');
  const improved = metrics.some((item) => item.status === 'improved');
  return {
    status: failed ? 'reject' : unknown ? 'inconclusive' : improved ? 'recommend_somatic_trial' : 'no_measured_gain',
    promotionAllowed: false,
    requiresIndependentReview: true,
    metrics,
    evidenceRefs: input.evidenceRefs
  };
}

async function recordSomaticAssessment(db, input) {
  const assessment = assessSomaticCandidate(input);
  return appendEvent(db, {
    id: input.eventId,
    organizationId: input.scope.organizationId,
    projectId: input.scope.projectId,
    entityId: input.entityId,
    type: 'decision_recorded',
    parentHash: input.parentHash,
    candidateHash: input.candidateHash,
    payload: { kind: 'somatic_assessment', assessment, profile: input.profile,
      assessmentInput: { baseline: input.baseline, candidate: input.candidate,
        profile: input.profile, evidenceRefs: input.evidenceRefs, binding: input.binding } }
  });
}

module.exports = { validateAssessment, assessSomaticCandidate, recordSomaticAssessment };
