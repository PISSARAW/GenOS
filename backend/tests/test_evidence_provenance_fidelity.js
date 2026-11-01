'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { recordWorkerEvidence, workerEvidenceDossiers } = require('../src/services/agentEvidence/workerEvidence');
const { workerEvidenceRounds } = require('../src/services/agentOrchestrationState');
const { issueReceipt, validateReceipt } = require('../src/services/epistemicVerifierReceiptService');
const { isValidRecordHash, payloadHash } = require('../src/services/provenanceHash');

function testWorkerEvidenceDossierProvenance() {
  const orchestratorId = 'orch-prov-1';
  const workerId = 'worker-prov-1';
  const runId = 'run-attempt-1';

  workerEvidenceRounds.set(orchestratorId, {
    participants: new Map(),
    events: new Map()
  });

  const mission = {
    orchestratorAgentId: orchestratorId,
    agentId: workerId,
    executionRunId: runId,
    name: 'Provenance Worker',
    role: 'tester'
  };

  const timestamp = new Date().toISOString();
  const rawEvent = {
    agentId: workerId,
    eventType: 'EVIDENCE_REPORT',
    action: 'test_execution',
    source: 'sub_agent_sandbox',
    timestamp,
    payload: {
      workerId,
      executionRunId: runId,
      command: 'cargo test --lib',
      exitCode: 0,
      evidenceDigest: 'sha256:11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff',
      attestation: 'test_pass_attestation',
      environmentHash: 'sha256:aabbccddeeff11223344556677889900aabbccddeeff11223344556677889900',
      report: {
        claims: [{
          statement: 'Library tests passed',
          evidence: [{ kind: 'test_result', what: 'cargo test', exitCode: 0 }]
        }]
      }
    }
  };

  recordWorkerEvidence(mission, rawEvent);

  const dossiers = workerEvidenceDossiers(orchestratorId, [{ agentId: workerId, name: 'Provenance Worker', role: 'tester' }]);
  assert.equal(dossiers.length, 1);
  const events = dossiers[0].events;
  assert.equal(events.length, 1);

  const recorded = events[0];
  assert.equal(recorded.workerId, workerId, 'Must preserve workerId');
  assert.equal(recorded.executionRunId, runId, 'Must preserve executionRunId');
  assert.equal(recorded.source, 'sub_agent_sandbox', 'Must preserve event source');
  assert.equal(recorded.timestamp, timestamp, 'Must preserve event timestamp');
  assert.equal(recorded.command, 'cargo test --lib', 'Must preserve executed command');
  assert.equal(recorded.exitCode, 0, 'Must preserve exit code');
  assert.equal(recorded.evidenceDigest, 'sha256:11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff');
  assert.equal(recorded.attestation, 'test_pass_attestation');
  assert.equal(recorded.environmentHash, 'sha256:aabbccddeeff11223344556677889900aabbccddeeff11223344556677889900');
}

function testEpistemicReceiptProvenanceGate() {
  process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'prov-secret-test-32bytes-padding';
  const verifierDigest = 'sha256:' + 'b'.repeat(64);
  const evidenceDigest = 'sha256:' + 'a'.repeat(64);

  const validReceipt = issueReceipt({
    resultId: 'res-prov-1',
    verifierDigest,
    evidenceDigest,
    independent: true
  });

  assert.equal(validateReceipt(validReceipt, [verifierDigest]), true, 'Complete signed receipt must pass validation');

  // Receipt with missing or empty evidenceDigest must be rejected
  const emptyDigestReceipt = { ...validReceipt, evidenceDigest: '' };
  assert.equal(validateReceipt(emptyDigestReceipt, [verifierDigest]), false, 'Receipt with empty evidenceDigest must be rejected');

  const missingDigestReceipt = { ...validReceipt, evidenceDigest: undefined };
  assert.equal(validateReceipt(missingDigestReceipt, [verifierDigest]), false, 'Receipt with undefined evidenceDigest must be rejected');
}

function testProvenanceHashIntegrity() {
  const payload = { fact: 'system_initialized', step: 1, ts: '2026-11-01T08:00:00.000Z' };
  const payloadJson = JSON.stringify(payload);
  const hash = crypto.createHash('sha256').update(payloadJson).digest('hex');

  const validRecord = {
    payload_hash: hash,
    payload_json: payloadJson,
    algorithm: 'sha256'
  };
  assert.equal(isValidRecordHash(validRecord), true, 'Valid record must be verified by hash');

  const tamperedRecord = {
    payload_hash: hash,
    payload_json: JSON.stringify({ fact: 'system_initialized', step: 2, ts: '2026-11-01T08:00:00.000Z' }),
    algorithm: 'sha256'
  };
  assert.equal(isValidRecordHash(tamperedRecord), false, 'Tampered payload must fail record hash validation');
}

async function main() {
  testWorkerEvidenceDossierProvenance();
  testEpistemicReceiptProvenanceGate();
  testProvenanceHashIntegrity();
  console.log('Evidence provenance fidelity tests passed successfully.');
}

main().catch((err) => {
  console.error('Evidence provenance fidelity test failed:', err);
  process.exit(1);
});
