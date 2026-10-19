'use strict';

const assert = require('node:assert/strict');
const { assessWebsite } = require('../src/services/shev/websiteStewardshipService');
const { createWebsiteCandidate, attachVerifiedReview,
  verifyLongitudinalWebsiteEffect } = require('../src/services/shev/websiteCandidateService');

const sensors = ['analytics', 'seo', 'geo', 'links', 'content', 'appsec'];

function assessment(environment, assessedAt, verdicts = {}, prefix = environment) {
  const start = Date.parse(assessedAt);
  return assessWebsite({ projectId: 'website-project', dimension: 'site',
    targetUrl: environment === 'preview' ? 'https://preview.example.test' : 'https://example.test',
    environment, assessedAt, readings: sensors.map((sensor) => ({ sensor, environment,
      verdict: verdicts[sensor] || 'stable', source: `${prefix}-${sensor}-api`,
      verifierRef: `${prefix}-${sensor}:v1`, observedAt: new Date(start - 60000).toISOString(),
      validUntil: new Date(start + 3600000).toISOString(),
      evidenceRefs: [`${prefix}:${sensor}:${assessedAt}`] })) });
}

function reviewedCandidate() {
  const preview = assessment('preview', '2026-10-18T09:00:00.000Z');
  const candidate = createWebsiteCandidate({ projectId: 'website-project', initiativeId: 'initiative-1',
    branch: 'codex/site-fix', sandboxRef: 'capsule:site-fix', previewAssessment: preview });
  assert.equal(candidate.deploymentAuthorized, false);
  assert.equal(candidate.effectResult, 'not_evaluated');
  return attachVerifiedReview(candidate, { verified: true, authorityType: 'human',
    reviewerRef: 'reviewer:ada', decision: 'approved', reviewedAt: '2026-10-18T10:00:00.000Z',
    evidenceRefs: ['review:sha256:1'] });
}

function deployment() {
  return { authorized: true, authorityRef: 'authorization:website-deployment:1',
    productionUrl: 'https://example.test', deployedAt: '2026-10-18T11:00:00.000Z',
    evidenceRefs: ['deployment:sha256:1'] };
}

function windows(lastVerdicts = {}, prefix = 'production') {
  return ['2026-10-19T12:00:00.000Z', '2026-10-20T12:00:00.000Z', '2026-10-21T12:00:00.000Z']
    .map((date, index) => assessment('production', date, index === 2 ? lastVerdicts : {}, prefix));
}

function main() {
  const candidate = reviewedCandidate();
  assert.equal(candidate.status, 'reviewed');
  assert.equal(candidate.deploymentAuthorized, false);
  assert.throws(() => verifyLongitudinalWebsiteEffect({ candidate,
    deployment: { ...deployment(), authorized: false }, windows: windows() }), /authorized/);
  const confirmed = verifyLongitudinalWebsiteEffect({ candidate, deployment: deployment(), windows: windows() });
  assert.equal(confirmed.result, 'confirmed');
  assert.equal(confirmed.previewUsedAsEffectEvidence, false);
  assert.equal(confirmed.causalClaim, false);
  assert.equal(confirmed.evidenceRefs.length, 1);
  const regressed = verifyLongitudinalWebsiteEffect({ candidate, deployment: deployment(),
    windows: windows({ appsec: 'degradation' }) });
  assert.equal(regressed.result, 'regressed');
  assert.throws(() => verifyLongitudinalWebsiteEffect({ candidate, deployment: deployment(),
    windows: windows({}, 'preview') }), /independent longitudinal/);
  const weakPreview = assessment('preview', '2026-10-18T09:00:00.000Z', { seo: 'degradation' });
  assert.throws(() => createWebsiteCandidate({ projectId: 'website-project', initiativeId: 'i2',
    branch: 'codex/weak', sandboxRef: 'capsule:weak', previewAssessment: weakPreview }), /clean, proven preview/);
  console.log('Website candidate isolation, review and longitudinal production gate passed.');
}

main();
