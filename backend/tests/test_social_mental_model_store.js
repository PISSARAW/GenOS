'use strict';

const assert = require('node:assert/strict');
const { openDatabase } = require('./helpers/biologyDatabase');
const { migrateSocialMentalModels } = require('../src/db/migrations/migrateSocialMentalModels');
const store = require('../src/services/socialMentalModelStore');

const base = {
  snapshotId: 'snapshot-a1', organizationId: 'org-a', projectId: 'project-a',
  subjectAgentId: 'agent-a', otherAgentId: 'agent-b', revision: 1,
  model: { relationHypotheses: [{ relationType: 'friend', confidence: 0.7 }] },
  sourceMemoryIds: ['memory-1', 'memory-2'],
};

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => error.code === code);
}

async function main() {
  const db = openDatabase();
  try {
    await migrateSocialMentalModels(db);
    await migrateSocialMentalModels(db);
    const first = await store.persistSocialMentalModel(db, base);
    assert.equal(first.revision, 1);
    assert.deepEqual(first.sourceMemoryIds, ['memory-1', 'memory-2']);
    assert.equal((await store.persistSocialMentalModel(db, base)).modelHash, first.modelHash);

    await expectCode(store.persistSocialMentalModel(db, {
      ...base, model: { relationHypotheses: [{ relationType: 'stranger', confidence: 0.2 }] },
    }), 'SOCIAL_MODEL_REVISION_CONFLICT');
    await expectCode(store.persistSocialMentalModel(db, {
      ...base, snapshotId: 'snapshot-a2', sourceMemoryIds: ['memory-3'],
    }), 'SOCIAL_MODEL_REVISION_CONFLICT');
    await expectCode(store.persistSocialMentalModel(db, { ...base, sourceMemoryIds: [] }), 'SOCIAL_MODEL_INVALID');

    await store.persistSocialMentalModel(db, {
      ...base, snapshotId: 'snapshot-a2', revision: 2, intervention: 'mask-social-memories',
      sourceMemoryIds: ['memory-3'], model: { relationHypotheses: [{ relationType: 'unknown', confidence: 0.1 }] },
    });
    const latest = await store.getLatestSocialMentalModel(db, base);
    assert.equal(latest.revision, 2);
    assert.equal(latest.intervention, 'mask-social-memories');
    assert.equal(await store.getLatestSocialMentalModel(db, {
      ...base, organizationId: 'org-b',
    }), null);
    console.log('Social mental model store: scoped immutable revisions and replay conflicts passed.');
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
