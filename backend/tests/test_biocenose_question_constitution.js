'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const biocenose = require('../src/services/biocenoseService');
const questionClassifier = require('../src/services/biocenose/question/questionClassifier');
const constitutionService = require('../src/services/biocenose/governance/constitutionService');
const store = require('../src/services/biocenose/communityStore');

function verifyQuestionTypes() {
  const cases = [
    ['What is the current API contract?', 'FACTUAL'],
    ['Estimate the probability of this failure.', 'PROBABILISTIC'],
    ['Design a resilient cache.', 'DESIGN'],
    ['Compare these options against cost and latency.', 'MULTI_CRITERIA'],
    ['Should we accept this policy?', 'NORMATIVE'],
    ['Explore possible explanations.', 'EXPLORATORY'],
    ['Should we design and compare two approaches?', 'MIXED']
  ];
  for (const [question, expected] of cases) {
    assert.equal(questionClassifier.classifyQuestion(question).questionType, expected, question);
  }
  assert.equal(questionClassifier.classifyQuestion('Anything?', { questionType: 'FACTUAL' }).confidence, 1);
  assert.throws(() => questionClassifier.classifyQuestion('Question?', { questionType: 'UNKNOWN' }),
    (error) => error.code === 'BIOCENOSE_QUESTION_TYPE_INVALID');
}

async function verifyConstitutionLifecycle() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const prepared = await biocenose.prepareCommunity({
      db, orchestratorId: 'orchestrator-1', missionId: 'mission-1',
      mission: 'What is the correct API contract?'
    });
    assert.equal(prepared.questionClassification.questionType, 'FACTUAL');
    assert.equal(prepared.constitutionVersion, 1);

    const session = await store.loadSession(db, prepared.communityId);
    const initial = await store.loadConstitution(db, prepared.constitutionId);
    assert.equal(session.constitutionId, prepared.constitutionId);
    assert.equal(initial.constitution.aggregationPolicy, 'verified_evidence');
    assert.match(initial.constitutionHash, /^[a-f0-9]{64}$/);
    await assert.rejects(() => constitutionService.revise({
      db, communityId: prepared.communityId, constitutionId: prepared.constitutionId,
      changes: { roundLimit: 4 }
    }), (error) => error.code === 'BIOCENOSE_CONSTITUTION_REASON_REQUIRED');

    const revised = await constitutionService.revise({
      db, communityId: prepared.communityId, constitutionId: prepared.constitutionId,
      changes: { roundLimit: 4 }, reason: 'Extend the bounded review for this protocol.', actorId: 'operator-1'
    });
    assert.equal(revised.version, 2);
    assert.equal(revised.constitution.roundLimit, 4);
    assert.notEqual(revised.constitutionHash, initial.constitutionHash);
    assert.deepEqual((await store.listEvents(db, prepared.communityId)).slice(-2).map((event) => event.type), [
      'CONSTITUTION_COMMITTED', 'CONSTITUTION_VERSIONED'
    ]);
    assert.equal((await store.loadSession(db, prepared.communityId)).constitutionId, revised.constitutionId);
  } finally {
    await db.close();
  }
}

async function run() {
  verifyQuestionTypes();
  await verifyConstitutionLifecycle();
  console.log('Biocenose question/constitution checks: PASS');
}

run().catch((error) => {
  console.error('Biocenose question/constitution checks failed:', error);
  process.exitCode = 1;
});
