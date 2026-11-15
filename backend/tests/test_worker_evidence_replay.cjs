'use strict';

const assert = require('node:assert/strict');
const {test} = require('node:test');
const replay = require('../src/services/workerCodeReplay');
const gate = require('../src/services/epistemic/workerReplayGateContext');

function stubExports(modulePath, overrides) {
  const loaded = require(modulePath);
  const original = loaded;
  require.cache[require.resolve(modulePath)].exports = {...loaded, ...overrides};
  return () => { require.cache[require.resolve(modulePath)].exports = original; };
}

test('creative replay requires a passing authenticated GQEL receipt and binds its artifact', () => {
  const receipt = {receiptId: 'gqel-creative-1'};
  const restoreContract = stubExports('../src/services/qualityElevation/qualityReceiptIntegrity', {
    assertReceipt: (actual, context) => {
      assert.equal(actual, receipt);
      assert.equal(context.text, 'screenplay body');
      return {passed: true, artifactDigest: 'a'.repeat(64)};
    }
  });
  const restoreTarget = stubExports('../src/services/qualityElevation/workerQualityContractEnforcer', {
    extractTargetContent: () => 'screenplay body'
  });
  try {
    const result = replay.qualityReplayEvidence({mission: {agentId: 'worker-1'}, report: {
      workerArtifact: {type: 'creative_candidate', content: {candidate: 'screenplay body'}},
      qualityElevationReceipt: receipt
    }});
    assert.deepEqual(result, {kind: 'native_gqel_quality_review', receiptId: receipt.receiptId,
      receiptDigest: require('../src/services/qualityElevation/qualityContract').digest(receipt),
      artifactDigest: 'a'.repeat(64)});
    assert.equal(replay.qualityReplayEvidence({mission: {}, report: {workerArtifact: {type: 'creative_candidate'}}}), null);
  } finally { restoreTarget(); restoreContract(); }
});

test('creative review evidence replays without inventing a shell test; code still requires commands', async () => {
  const report = {workerArtifact: {type: 'creative_candidate', content: {candidate: 'story'}},
    qualityElevationReceipt: {receiptId: 'gqel-1'},
    tests: [{name: 'native_independent_quality_review', passed: true}]};
  const restoreContract = stubExports('../src/services/qualityElevation/qualityReceiptIntegrity', {
    assertReceipt: () => ({passed: true, artifactDigest: 'd'.repeat(64)})
  });
  const restoreTarget = stubExports('../src/services/qualityElevation/workerQualityContractEnforcer', {
    extractTargetContent: () => 'story'
  });
  let tests;
  try {
    tests = await replay.replayTests({mission: {}, event: {payload: {evidenceReport: report}}, replayRoot: '.'});
  } finally { restoreTarget(); restoreContract(); }
  assert.deepEqual(tests, []);
  await assert.rejects(replay.replayTests({mission: {}, event: {payload: {evidenceReport: {tests: []}}}, replayRoot: '.'}),
    {message: 'WORKER_REPLAY_TESTS_MISSING'});
  await assert.rejects(replay.replayTests({mission: {executionPolicy: {allowedCommands: []}},
    event: {payload: {evidenceReport: {tests: [{name: 'receipt'}, {command: 'powershell echo blocked'}]}}}, replayRoot: '.'}),
  {message: 'WORKER_REPLAY_TEST_FORBIDDEN'});
});

test('the native promotion replay gate accepts only well-bound creative quality evidence', () => {
  const valid = {schema: 'genos.worker-evidence-replay/v1', tests: [], verification: {
    kind: 'native_gqel_quality_review', receiptId: 'gqel-1', receiptDigest: 'b'.repeat(64), artifactDigest: 'c'.repeat(64)}};
  assert.doesNotThrow(() => gate.assertVerification(valid));
  assert.throws(() => gate.assertVerification({...valid, verification: {...valid.verification, receiptDigest: 'bad'}}),
    {message: 'WORKER_REPLAY_QUALITY_EVIDENCE_INVALID'});
  assert.throws(() => gate.assertVerification({...valid, tests: [{exitCode: 0}]}),
    {message: 'WORKER_REPLAY_QUALITY_EVIDENCE_INVALID'});
  assert.throws(() => gate.assertVerification({schema: 'genos.worker-code-replay/v1', tests: []}),
    {message: 'WORKER_REPLAY_TESTS_MISSING'});
});
