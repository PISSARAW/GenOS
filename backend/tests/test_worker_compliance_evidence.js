'use strict';

const assert = require('node:assert/strict');
const { oracleAccepted, missionError, successfulOutcome } = require('./workerComplianceEvidence.cjs');

const oracle = { status: 'accepted_at_decision', decisionStatus: 'completed', complete: true,
  processes: 2, decisionHash: 'sha256:example' };
assert.equal(oracleAccepted({ deterministic: true }, oracle), true);
assert.equal(oracleAccepted({ deterministic: true }, { ...oracle, processes: 1 }), false);
assert.equal(oracleAccepted({ deterministic: true }, { ...oracle, status: 'attested' }), false);
assert.equal(oracleAccepted({ deterministic: true }, { ...oracle, decisionStatus: 'blocked' }), false);
assert.equal(oracleAccepted({ deterministic: false }, { status: 'not_applicable' }), null);

const completed = { persistedContract: true, parentBound: true, runtimeStarted: true,
  executionRunBound: true, run: { status: 'completed' }, eventType: 'AGENT_COMPLETED',
  report: { outcome: 'success' }, nativeExecution: true, oracleAccepted: true,
  artifact: 'dossier', expected: 'dossier',
  artifactValidated: true, correctReference: true, refusalsValidated: true };
assert.equal(successfulOutcome(completed), true);
assert.equal(successfulOutcome({ ...completed, run: { status: 'blocked' } }), false);
assert.equal(successfulOutcome({ ...completed, eventType: 'AGENT_FAILED' }), false);
assert.equal(successfulOutcome({ ...completed, oracleAccepted: false }), false);
assert.equal(successfulOutcome({ ...completed, nativeExecution: false, oracleAccepted: null }), true);
assert.equal(missionError({ passed: true }), null);
assert.equal(missionError({ passed: false, eventPayload: { failure: { reason: 'promotion refused' } } }),
  'promotion refused');

console.log('Worker compliance binds terminal run state and independent oracle evidence: PASS');
