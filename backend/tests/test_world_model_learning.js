'use strict';

const assert = require('node:assert/strict');
const learning = require('../src/services/predictiveTimescale/worldModelLearningService');

function prediction(overrides = {}) {
  return { predictionId: 'prediction-1', version: 2, modelId: 'release-world-v2',
    contextKey: 'production-eu', metric: 'latency_ms', mean: 120, variance: 100,
    confidence: 0.8, falsificationTolerance: 25, projectId: 'project:genos',
    trajectoryId: 'trajectory:release-7', actionRef: 'action:deploy-42',
    responsibleAgentId: 'agent:release', assumptionIds: ['assumption:cache-hot'],
    commitment: 'commitment:abc', ...overrides };
}

function observation(overrides = {}) {
  return { observationId: 'observation-1', value: 170, residual: 50,
    signerFingerprint: 'sensor-key-fingerprint', evidenceRefs: ['receipt:prod-1'],
    independentRefs: ['probe:a', 'probe:b'], observedAt: '2026-10-19T09:05:00.000Z', ...overrides };
}

function verifiesProvenanceMemories() {
  const state = {};
  const result = learning.learn(state, prediction(), observation());
  assert.equal(result.episode.trajectoryId, 'trajectory:release-7');
  assert.equal(result.episode.responsibleAgentId, 'agent:release');
  assert.equal(result.episode.predictionCommitment, 'commitment:abc');
  assert.equal(result.semantic.sampleCount, 1);
  assert.equal(result.semantic.meanAbsoluteError, 50);
  assert.equal(result.semantic.provenance.signerFingerprint, 'sensor-key-fingerprint');
}

function verifiesEvidenceBoundInvalidation() {
  const challenged = learning.learn({}, prediction(), observation({ independentRefs: ['probe:a'] }));
  assert.equal(challenged.assumptionRevisions[0].status, 'CHALLENGED');
  const invalidated = learning.learn({}, prediction(), observation());
  assert.equal(invalidated.assumptionRevisions[0].status, 'INVALIDATED');
  const confirmed = learning.learn({}, prediction(), observation({ residual: 10 }));
  assert.deepEqual(confirmed.assumptionRevisions, []);
}

function verifiesCalibrationAcrossEpisodes() {
  const state = {};
  const first = learning.learn(state, prediction(), observation({ residual: 10, observationId: 'obs-1' }));
  const second = learning.learn(state, prediction(), observation({ residual: 40, observationId: 'obs-2' }));
  assert.equal(second.semantic.sampleCount, 2);
  assert.equal(second.semantic.meanAbsoluteError, 25);
  assert.ok(second.semantic.calibratedConfidence < first.semantic.calibratedConfidence);
}

verifiesProvenanceMemories();
verifiesEvidenceBoundInvalidation();
verifiesCalibrationAcrossEpisodes();
console.log('World-model learning and provenance checks passed.');
