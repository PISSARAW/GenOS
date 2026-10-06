'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const service = require('../src/services/biocenoseService');
const gate = require('../src/services/biocenose/judgment/promotionGateService');
const assessment = require('../src/services/biocenose/judgment/outcomeAssessment');
const acceptability = require('../src/services/biocenose/argumentation/acceptabilityService');
const independence = require('../src/services/biocenose/formation/effectiveCommunitySizeService');
const fixture = require('./helpers/biocenoseCompletionFixtures');

async function testMixedCoverage(db) {
  const community = await fixture.prepare(db, { questionType: 'MIXED' });
  const persisted = [{ claimId: 'fact', claim: { type: 'FACTUAL' } }, { claimId: 'values', claim: { type: 'NORMATIVE' } }];
  const aggregation = { questionType: 'MIXED', outcome: 'TYPE_SPECIFIC_RESULTS', results: [
    { claimId: 'fact', result: { questionType: 'NORMATIVE', outcome: 'EVIDENCE_SUPPORTED', verifiedClaimIds: ['fact'] } },
    { claimId: 'values', result: { questionType: 'NORMATIVE', outcome: 'PLURALISM_PRESERVED',
      perspectives: [{ position: 'debate' }], humanJudgmentRequired: true } }
  ] };
  const input = { db, aggregation, persistedClaimIds: ['fact', 'values'] };
  const result = await gate.evaluate(input, community, persisted);
  assert.equal(result.gate.status, 'REVIEW_REQUIRED', 'a factual entry cannot bypass verification by changing its declared result type');
  assert.equal(assessment.needsHuman(result.aggregation), true);
  assert.equal(assessment.ready(result.aggregation), false);
  const omitted = await gate.evaluate({ ...input, aggregation: { ...aggregation, results: [aggregation.results[1]] } }, community, persisted);
  assert.equal(omitted.gate.status, 'REVIEW_REQUIRED');
  const empty = await gate.evaluate({ ...input, aggregation: { ...aggregation, results: [] } }, community, persisted);
  assert.equal(empty.gate.status, 'REVIEW_REQUIRED');
}

async function testWrongOracleScope(db) {
  const community = await fixture.prepare(db);
  const input = fixture.runtimeInput(db, community.communityId);
  input.verificationExecutor = async () => ({ status: 'VERIFIED', oracle: 'trusted', claimId: 'different-claim' });
  const result = await service.runBiocenoseRound(input);
  assert.equal(result.receipts.at(-1).result.judgment.status, 'IRREDUCIBLE_DISAGREEMENT');
  assert.equal(result.receipts[2].result.verificationReceipts.length, 0);
}

function testEvidenceSemantics() {
  assert.equal(assessment.ready({ outcome: 'INVENTED_SUCCESS' }), false);
  assert.equal(assessment.ready({ outcome: 'TYPE_SPECIFIC_RESULTS', results: [] }), false);
  assert.equal(assessment.ready({ outcome: 'POLYCENTRIC_JUDGMENT', polycentric: { clusters: [{ outcome: 'ABSTAIN' }] } }), false);
  assert.deepEqual(acceptability.groundedLabelling({ arguments: [{ argumentId: 'self' }],
    attacks: [{ from: 'self', to: 'self' }] }).undecided, ['self']);
  const vectors = [{ errorVectorScope: 's', errorVector: [0, 1, 0] },
    { errorVectorScope: 's', errorVector: [0, 0, 1] }, { errorVectorScope: 's', errorVector: [1, 1, 1] }];
  assert.equal(independence.effectiveCommunitySize(vectors).measured, false, 'all pairs are required, including constant vectors');
  assert.equal(independence.effectiveCommunitySize([{ ...vectors[0], errorVector: [0, NaN, 1] }, vectors[1]]).measured, false);
}

async function run() {
  testEvidenceSemantics();
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try { await testMixedCoverage(db); await testWrongOracleScope(db); }
  finally { await db.close(); }
}

run().then(() => console.log('Biocenose decision boundaries: PASS')).catch((error) => {
  console.error(error); process.exitCode = 1;
});
