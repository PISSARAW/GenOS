'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateGvxLedger } = require('../src/db/migrations/migrateGvxLedger');
const stewardship = require('../src/services/gvxSkillStewardship');

const HASH = 'a'.repeat(64);
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
  } finally { await db.close(); }
  console.log('GVX skill stewardship registration checks passed.');
}

main().catch((failure) => { console.error(failure); process.exitCode = 1; });
