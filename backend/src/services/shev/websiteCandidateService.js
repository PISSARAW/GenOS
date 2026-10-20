'use strict';

const { createHash } = require('node:crypto');

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function validRefs(refs) {
  return Array.isArray(refs) && refs.length > 0
    && refs.every((ref) => nonEmpty(ref) && ref.length <= 512);
}

function createWebsiteCandidate(input) {
  const preview = input?.previewAssessment;
  if (!nonEmpty(input?.projectId) || !nonEmpty(input.initiativeId)
    || !nonEmpty(input.branch) || !nonEmpty(input.sandboxRef)
    || preview?.projectId !== input.projectId || preview.environment !== 'preview'
    || preview.action !== 'NO_CHANGE' || preview.kind !== 'state'
    || !validRefs(preview.evidenceRefs)) {
    throw new Error('Website candidate requires a clean, proven preview in an isolated branch and sandbox.');
  }
  const identity = { projectId: input.projectId, initiativeId: input.initiativeId,
    branch: input.branch, sandboxRef: input.sandboxRef,
    previewHash: preview.assessmentHash };
  return { ...identity, id: `website_candidate_${hash(identity)}`, status: 'candidate',
    previewUrl: preview.targetUrl, previewEvidenceRefs: preview.evidenceRefs,
    previewCriticalVerifierRefs: preview.readings.filter((reading) =>
      ['analytics', 'appsec'].includes(reading.sensor)).map((reading) => reading.verifierRef),
    effectResult: 'not_evaluated', deploymentAuthorized: false };
}

function attachVerifiedReview(candidate, review) {
  if (candidate?.status !== 'candidate' || review?.verified !== true
    || !['human', 'policy'].includes(review.authorityType)
    || !nonEmpty(review.reviewerRef) || review.decision !== 'approved'
    || !validRefs(review.evidenceRefs) || !Number.isFinite(Date.parse(review.reviewedAt))) {
    throw new Error('Website candidate review is absent, rejected or unverified.');
  }
  return { ...candidate, status: 'reviewed', review: { authorityType: review.authorityType,
    reviewerRef: review.reviewerRef, reviewedAt: new Date(review.reviewedAt).toISOString(),
    evidenceRefs: [...new Set(review.evidenceRefs)] }, deploymentAuthorized: false };
}

function validDeployment(candidate, deployment) {
  return candidate.status === 'reviewed' && deployment?.authorized === true
    && nonEmpty(deployment.authorityRef) && nonEmpty(deployment.productionUrl)
    && deployment.productionUrl !== candidate.previewUrl && validRefs(deployment.evidenceRefs)
    && Number.isFinite(Date.parse(deployment.deployedAt));
}

function sameScope(candidate, deployment, assessment) {
  return assessment?.projectId === candidate.projectId
    && assessment.dimension && assessment.environment === 'production'
    && assessment.targetUrl === deployment.productionUrl
    && Number.isFinite(Date.parse(assessment.assessedAt));
}

function independentCriticalSensors(candidate, assessment) {
  const previewRefs = new Set(candidate.previewEvidenceRefs);
  const previewVerifiers = new Set(candidate.previewCriticalVerifierRefs);
  return ['analytics', 'appsec'].every((sensor) => {
    const reading = assessment.readings?.find((item) => item.sensor === sensor);
    return reading && !previewVerifiers.has(reading.verifierRef)
      && !reading.evidenceRefs.some((ref) => previewRefs.has(ref));
  });
}

function validWindows(input, minSpanMs) {
  if (!Array.isArray(input.windows) || input.windows.length < 3
    || !input.windows.every((item) => sameScope(input.candidate, input.deployment, item)
      && independentCriticalSensors(input.candidate, item))) return false;
  const timestamps = input.windows.map((item) => Date.parse(item.assessedAt));
  const hashes = input.windows.map((item) => item.assessmentHash);
  return new Set(hashes).size === hashes.length
    && timestamps.every((value, index) => index === 0 || value > timestamps[index - 1])
    && timestamps.at(-1) - timestamps[0] >= minSpanMs
    && timestamps[0] > Date.parse(input.deployment.deployedAt);
}

function resultOf(windows) {
  if (windows.some((item) => ['risk', 'degradation'].includes(item.kind))) return 'regressed';
  if (windows.some((item) => item.kind !== 'state' || item.action !== 'NO_CHANGE')) return 'inconclusive';
  return 'confirmed';
}

function verifyLongitudinalWebsiteEffect(input) {
  const minSpanMs = input?.minSpanMs ?? 86400000;
  if (!Number.isSafeInteger(minSpanMs) || minSpanMs < 3600000
    || !validDeployment(input?.candidate || {}, input?.deployment)) {
    throw new Error('Website effect requires a separately authorized production deployment.');
  }
  if (!validWindows(input, minSpanMs)) {
    throw new Error('Website effect requires independent longitudinal user and AppSec evidence.');
  }
  const result = resultOf(input.windows);
  const receipt = { candidateId: input.candidate.id, productionUrl: input.deployment.productionUrl,
    deploymentAuthorityRef: input.deployment.authorityRef,
    assessedFrom: input.windows[0].assessedAt,
    assessedUntil: input.windows.at(-1).assessedAt, windows: input.windows.length,
    userOutcomeSensor: 'analytics', securitySensor: 'appsec', result,
    previewUsedAsEffectEvidence: false, causalClaim: false };
  const receiptHash = hash(receipt);
  return { ...receipt, receiptHash, verifierRef: 'website-longitudinal:v1',
    evidenceRefs: [`website-longitudinal:sha256:${receiptHash}`] };
}

module.exports = { createWebsiteCandidate, attachVerifiedReview, verifyLongitudinalWebsiteEffect };
