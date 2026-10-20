'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateGvxLedger } = require('../src/db/migrations/migrateGvxLedger');
const stewardship = require('../src/services/gvxSkillStewardship');

const HASH = 'a'.repeat(64);
const EVIDENCE = ['b'.repeat(64), 'c'.repeat(64), 'd'.repeat(64), 'e'.repeat(64)];
const scope = { organizationId: 'org', projectId: 'project', entityId: 'agent' };

function registration(overrides = {}) {
  return { scope, registrationId: 'registration-1',
    responsibility: { responsibilityId: 'release-safety', ownerId: 'product-owner',
      objective: 'Réduire les régressions de livraison', contextId: 'payments',
      metricId: 'escaped-defects', direction: 'lower' },
    skill: { skillId: 'release-triage', version: 1, parentVersion: null,
      artifactHash: HASH, producerId: 'learner', curriculumEventId: 'curriculum-1',
      sourceExperienceIds: ['experience-2', 'experience-1'] },
    authority: { isAllowed: async () => true }, ...overrides };
}

function assessment(registrationEventId, overrides = {}) {
  return { scope, assessmentId: 'assessment-1', registrationEventId,
    observations: { reuse: [
      { observationId: 'reuse-1', contextId: 'payments-release', verifierId: 'verifier-a',
        baseline: 10, candidate: 7, evidenceRef: EVIDENCE[0] },
      { observationId: 'reuse-2', contextId: 'merchant-onboarding', verifierId: 'verifier-b',
        baseline: 8, candidate: 5, evidenceRef: EVIDENCE[1] }
    ], retention: [
      { observationId: 'retention-1', contextId: 'payments-release', verifierId: 'verifier-c',
        baseline: 6, candidate: 9, evidenceRef: EVIDENCE[2] }
    ], holdout: { observationId: 'holdout-1', contextId: 'ledger', verifierId: 'independent-reviewer',
      baseline: 9, candidate: 6, evidenceRef: EVIDENCE[3], sealed: true } },
    policy: { minReuseCount: 2, minProjectBenefit: 1, maxRegression: 1 },
    authority: { isAllowed: async () => true }, ...overrides };
}

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateGvxLedger(db);
    const result = await stewardship.registerSkillResponsibility(db, registration());
    assert.equal(result.status, 'registered_for_observation');
    assert.equal(result.automaticPromotion, false);
    assert.deepEqual(result.skill.sourceExperienceIds, ['experience-1', 'experience-2']);
    const stored = await stewardship.readRegistration(db, {
      scope, registrationEventId: result.eventId
    });
    assert.equal(stored.payload.responsibility.ownerId, 'product-owner');
    assert.equal(stored.payload.policy.adoption, 'external_review_only');
    assert.equal(stored.candidateHash, HASH);
    const replay = await stewardship.registerSkillResponsibility(db, registration());
    assert.equal(replay.eventId, result.eventId);
    await assert.rejects(stewardship.registerSkillResponsibility(db,
      registration({ registrationId: 'registration-denied', authority: { isAllowed: async () => false } })),
    { code: 'GVX_SKILL_RESPONSIBILITY_DENIED' });
    await assert.rejects(stewardship.registerSkillResponsibility(db,
      registration({ skill: { ...registration().skill, sourceExperienceIds: [] } })),
    { code: 'GVX_SKILL_RESPONSIBILITY_INVALID' });
    const observed = await stewardship.qualifySkillStewardship(db, assessment(result.eventId));
    assert.equal(observed.metrics.reuseCount, 2);
    assert.equal(observed.metrics.projectBenefit, 3);
    assert.equal(observed.metrics.holdoutBenefit, 3);
    assert.equal(observed.metrics.holdoutPassed, true);
    assert.equal(observed.metrics.regressionDetected, true);
    assert.equal(observed.metrics.forgettingDisposition, 'quarantine_and_relearn');
    assert.equal(observed.automaticPromotion, false);
    const assessmentEvent = await stewardship.readAssessment(db,
      { scope, assessmentEventId: observed.eventId });
    assert.equal(assessmentEvent.candidateHash, HASH);
    assert.deepEqual(assessmentEvent.payload.metrics.evidenceRefs, [...EVIDENCE].sort());
    let reviewCalls = 0;
    const regressedDecision = await stewardship.decideSkillStewardship(db, {
      scope, decisionId: 'decision-regressed', assessmentEventId: observed.eventId,
      authority: { isAllowed: async () => { reviewCalls += 1; return true; } }
    });
    assert.equal(regressedDecision.decision, 'NO_CHANGE');
    assert.deepEqual(regressedDecision.reasons, ['regression_detected']);
    assert.equal(reviewCalls, 0, 'une preuve régressée ne doit pas solliciter une adoption');
    const retainedInput = assessment(result.eventId, { assessmentId: 'assessment-retained' });
    retainedInput.observations.retention[0].candidate = 6;
    const retained = await stewardship.qualifySkillStewardship(db, retainedInput);
    const review = await stewardship.decideSkillStewardship(db, {
      scope, decisionId: 'decision-review', assessmentEventId: retained.eventId,
      authority: { isAllowed: async (request) => request.action === 'request_skill_adoption_review' }
    });
    assert.equal(review.decision, 'EXTERNAL_REVIEW_REQUIRED');
    assert.equal(review.requestedAction, 'review_versioned_skill_adoption');
    assert.equal(review.automaticPromotion, false);
    const denied = await stewardship.decideSkillStewardship(db, {
      scope, decisionId: 'decision-denied', assessmentEventId: retained.eventId,
      authority: { isAllowed: async () => false }
    });
    assert.equal(denied.decision, 'NO_CHANGE');
    assert.deepEqual(denied.reasons, ['authority_denied']);
    const decisionEvent = await stewardship.readDecision(db,
      { scope, decisionEventId: review.eventId });
    assert.equal(decisionEvent.payload.decision.automaticPromotion, false);
    const applications = await db.all("SELECT id FROM gvx_development_events WHERE event_type = 'application_recorded'");
    assert.equal(applications.length, 0, 'aucune promotion ne doit être appliquée par ce service');
    const contaminated = assessment(result.eventId, { assessmentId: 'assessment-contaminated' });
    contaminated.observations.holdout.contextId = 'payments';
    await assert.rejects(stewardship.qualifySkillStewardship(db, contaminated),
      { code: 'GVX_SKILL_OBSERVATION_INVALID' });
    await assert.rejects(stewardship.qualifySkillStewardship(db,
      assessment(result.eventId, { assessmentId: 'assessment-denied', authority: { isAllowed: async () => false } })),
    { code: 'GVX_SKILL_ASSESSMENT_DENIED' });
  } finally { await db.close(); }
  console.log('GVX skill stewardship registration checks passed.');
}

main().catch((failure) => { console.error(failure); process.exitCode = 1; });
