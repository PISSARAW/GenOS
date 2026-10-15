'use strict';

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'terminal-quality-evidence-test';
const assert = require('node:assert/strict');
const gate = require('../src/services/epistemic/nativeOracleGate');
const quality = require('../src/services/terminalQualityEvidence');
const validation = require('../src/services/morphogenesis/learning/outcomeEvidenceValidation');

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
  } finally {
    gate.context = originalContext;
  }
  console.log('Terminal quality evidence is signed, run-bound and omitted with a reason when no accepted oracle exists.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
