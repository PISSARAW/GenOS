'use strict';

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'terminal-quality-evidence-test';
const assert = require('node:assert/strict');
const gate = require('../src/services/epistemic/nativeOracleGate');
const quality = require('../src/services/terminalQualityEvidence');
const validation = require('../src/services/morphogenesis/learning/outcomeEvidenceValidation');
const terminalOutcome = require('../src/services/terminalOutcomeEvidence');
const verifierTrust = require('../src/services/verifierTrustRegistry');
const receipts = require('../src/services/epistemicVerifierReceiptService');

async function main() {
  const originalContext = gate.context;
  const proof = { attestation: { hash: 'attestation-hash', eventId: 'oracle-event',
    value: { completedAt: '2026-10-15T12:00:00.000Z' } }, saved: { evaluation: {
    allAccepted: true, assembly: { verifications: [
      { resultId: 'result-a', verifierDigest: 'digest-a', status: 'verified', independent: true, signature: 'sig-a' },
      { resultId: 'result-b', verifierDigest: 'digest-b', status: 'verified', independent: true, signature: 'sig-b' }
    ] }
  } } };
  gate.context = async () => ({ proof });
  const db = { get: async () => ({ executionMode: 'worker', organizationId: 'org-a', projectId: 'project-a' }) };
  try {
    const event = await quality.attach(db, { agentId: 'agent-a', event: { eventType: 'AGENT_COMPLETED',
      payload: { executionRunId: 'run-a', evidenceReport: { outcome: 'success' },
        qualityEvidence: { success: true, value: 0.99, forged: true } } } });
    assert.equal(event.payload.qualityEvidence.success, true);
    assert.equal(event.payload.qualityEvidence.value, 1, 'quality is the binary result of accepted oracle quorum');
    assert.equal(event.payload.qualityEvidence.actionId, 'run-a');
    assert.equal(event.payload.qualityEvidence.agentId, 'agent-a');
    assert.equal(event.payload.qualityEvidence.organizationId, 'org-a');
    assert.equal(event.payload.qualityEvidence.projectId, 'project-a');
    assert.equal(event.payload.qualityEvidenceStatus.status, 'verified');
    assert.equal(validation.validate(event.payload.qualityEvidence, { actionId: 'run-a', agentId: 'agent-a',
      organizationId: 'org-a', projectId: 'project-a' }), true);
    assert.equal(validation.validate(event.payload.qualityEvidence, { actionId: 'other-run', agentId: 'agent-a',
      organizationId: 'org-a', projectId: 'project-a' }), false);
    const replay = await quality.attach(db, { agentId: 'agent-a', event: { eventType: 'AGENT_COMPLETED',
      payload: { executionRunId: 'run-a', evidenceReport: { outcome: 'success' } } } });
    assert.deepEqual(replay.payload.qualityEvidence, event.payload.qualityEvidence,
      'the same accepted oracle proof yields the same signed quality receipt on replay');

    gate.context = async () => { throw Object.assign(new Error('No independent oracle'), { code: 'ORACLE_UNAVAILABLE' }); };
    const unavailable = await quality.attach(db, { agentId: 'agent-a', event: { eventType: 'AGENT_COMPLETED',
      payload: { executionRunId: 'run-b', qualityEvidence: { forged: true } } } });
    assert.equal(unavailable.payload.qualityEvidence, undefined);
    assert.deepEqual(unavailable.payload.qualityEvidenceStatus, { status: 'unavailable', reason: 'ORACLE_UNAVAILABLE' });
    const abstention = await quality.attach(db, { agentId: 'agent-a', event: { eventType: 'WORKER_NO_ANSWER_PROVEN',
      payload: { executionRunId: 'run-c' } } });
    assert.equal(abstention.payload.qualityEvidence, undefined);
    assert.equal(abstention.payload.qualityEvidenceStatus.reason, 'no_answer_has_no_quality_score');

    const failedEvent = { eventType: 'AGENT_FAILED', payload: { executionRunId: 'run-fail',
      failure: { category: 'assertion', reason: 'independent negative fixture' } } };
    const negativeEvidence = signNegativeOutcome(failedEvent);
    const verifiedFailure = await quality.attach(db, { agentId: 'agent-a', event: {
      ...failedEvent, payload: { ...failedEvent.payload, negativeOutcomeEvidence: negativeEvidence }
    } });
    assert.equal(verifiedFailure.payload.qualityEvidence, undefined,
      'a verified failure must not become positive quality evidence');
    assert.equal(verifiedFailure.payload.qualityEvidenceStatus.status, 'unavailable');
    assert.deepEqual(verifiedFailure.payload.negativeOutcomeEvidenceStatus, {
      status: 'verified', schema: terminalOutcome.NEGATIVE_OUTCOME_SCHEMA, receiptId: negativeEvidence.receiptId
    });
    assert.equal(verifiedFailure.payload.negativeOutcomeEvidence.success, false);

    const alteredFailure = { ...failedEvent, payload: { ...failedEvent.payload,
      failure: { category: 'assertion', reason: 'changed after verifier signed' }, negativeOutcomeEvidence: negativeEvidence }
    };
    const rejectedFailure = await quality.attach(db, { agentId: 'agent-a', event: alteredFailure });
    assert.equal(rejectedFailure.payload.negativeOutcomeEvidence, undefined,
      'changing the failure event after signing must discard its negative evidence');
    assert.equal(rejectedFailure.payload.negativeOutcomeEvidenceStatus.status, 'unavailable');

    const unscoped = await quality.attach({ get: async () => null }, { agentId: 'missing-agent', event: {
      eventType: 'AGENT_FAILED', payload: { executionRunId: 'run-unscoped' }
    } });
    assert.deepEqual(unscoped.payload.qualityEvidenceStatus, { status: 'unavailable', reason: 'worker_scope_required' });
    assert.deepEqual(unscoped.payload.negativeOutcomeEvidenceStatus, { status: 'unavailable', reason: 'worker_scope_required' });
  } finally {
    gate.context = originalContext;
  }
  console.log('Terminal quality evidence is signed, run-bound and omitted with a reason when no accepted oracle exists.');
}

function signNegativeOutcome(event) {
  const receiptId = `negative:${event.payload.executionRunId}`;
  const evidence = { status: 'VERIFIED', kind: 'oracle', receiptId, success: false, value: 0,
    actionId: event.payload.executionRunId, agentId: 'agent-a', organizationId: 'org-a', projectId: 'project-a',
    learningContext: { schema: terminalOutcome.NEGATIVE_OUTCOME_SCHEMA, eventType: event.eventType,
      terminalEventHash: terminalOutcome.terminalEventHash(event) } };
  evidence.receipt = receipts.issueReceipt({ resultId: receiptId,
    evidenceDigest: validation.evidenceDigest(evidence), verifierDigest: verifierTrust.ensureVerifier('testResult').digest,
    independent: true, status: 'verified', nonce: receiptId,
    independenceDescriptor: { actorId: 'failure-oracle', workspaceId: 'isolated-failure-verifier' } });
  return evidence;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
