'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const contracts = require('../src/services/versionedContractService');

const schemaPath = path.resolve(__dirname, '../../spec/cognitive-episode.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

function episode(overrides = {}) {
  return {
    transitionId: 'transition-1', episodeId: 'episode-1', agentId: 'agent-1', projectId: 'project-1',
    mandateRef: 'mandate:1', fromState: null, toState: 'DETECTED',
    triggerRef: 'observation:1', questionRef: null, decisionRef: null,
    taskRef: null, jobRef: null,
    budget: { tokens: 1000, usd: 0.05, seconds: 30 },
    evidenceRefs: [], stopReason: null,
    occurredAt: '2026-10-18T10:00:00.000Z', previousReceiptId: null,
    ...overrides
  };
}

function assertAccepted(payload) {
  assert.equal(validate(payload), true, JSON.stringify(validate.errors));
  assert.equal(contracts.validateContract('EndogenousThoughtEpisode', payload).valid, true);
}

function assertRejected(payload) {
  assert.equal(validate(payload), false, 'JSON Schema should reject the payload');
  assert.equal(contracts.validateContract('EndogenousThoughtEpisode', payload).valid, false,
    'Runtime contract should reject the payload');
}

function transitionPayload(fromState, toState) {
  const terminal = ['STOPPED', 'ABSTAINED', 'FAILED'].includes(toState);
  return episode({
    fromState, toState,
    questionRef: 'question:matrix', decisionRef: 'decision:matrix',
    taskRef: 'task:matrix', jobRef: 'job:matrix',
    evidenceRefs: ['evidence:matrix'],
    stopReason: terminal ? 'matrix terminal state' : null,
    previousReceiptId: toState === 'DETECTED' ? null : 'receipt:matrix'
  });
}

assert.equal(schema['x-genos-contract-version'], contracts.CONTRACT_VERSION);
assert.deepEqual(schema['x-genos-boundaries'], {
  authorityGranted: false,
  promotionEligible: false,
  phenomenalConsciousnessAssessed: false,
  privateReasoningAllowed: false
});

assertAccepted(episode());
assertAccepted(episode({
  fromState: 'RUNNING', toState: 'VERIFIED', questionRef: 'question:1',
  decisionRef: 'decision:1', taskRef: 'task:1', jobRef: 'job:1',
  evidenceRefs: ['evidence:1'], previousReceiptId: 'receipt:running'
}));
assertAccepted(episode({
  fromState: 'LEARNED', toState: 'STOPPED', questionRef: 'question:1',
  decisionRef: 'decision:1', taskRef: 'task:1', jobRef: 'job:1',
  evidenceRefs: ['evidence:1'], stopReason: 'objectif atteint',
  previousReceiptId: 'receipt:learned'
}));
assertAccepted(episode({
  fromState: 'FOLLOW_UP', toState: 'QUESTIONED', questionRef: 'question:2',
  previousReceiptId: 'receipt:follow-up'
}));

assertRejected(episode({ fromState: 'DETECTED', toState: 'VERIFIED',
  previousReceiptId: 'receipt:detected' }));
assertRejected(episode({ fromState: 'RUNNING', toState: 'VERIFIED',
  questionRef: 'question:1', decisionRef: 'decision:1', taskRef: 'task:1',
  jobRef: 'job:1', previousReceiptId: 'receipt:running' }));
assertRejected(episode({ fromState: 'DETECTED', toState: 'QUESTIONED',
  previousReceiptId: 'receipt:detected' }));
assertRejected(episode({ fromState: 'DETECTED', toState: 'STOPPED',
  stopReason: 'premature', previousReceiptId: 'receipt:detected' }));
assertRejected(episode({ unexpectedAuthority: true }));
assertRejected(episode({ budget: { tokens: 0, usd: 0, seconds: 1 } }));

const states = schema.$defs.thoughtState.enum;
for (const fromState of [null, ...states]) {
  for (const toState of states) {
    const payload = transitionPayload(fromState, toState);
    const schemaValid = validate(payload);
    const runtimeValid = contracts.validateContract('EndogenousThoughtEpisode', payload).valid;
    assert.equal(schemaValid, runtimeValid,
      `transition parity failed for ${String(fromState)} -> ${toState}`);
  }
}

console.log('Cognitive episode schema and runtime contract parity passed.');
