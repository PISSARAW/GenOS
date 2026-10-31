'use strict';

const assert = require('node:assert/strict');
const {
  recordWorkerEvidence,
  workerEvidenceDossiers,
  validateWorkerDossierCoherence
} = require('../src/services/agentEvidenceService');
const {
  workerEvidenceRounds,
  activeWorkerBarriers
} = require('../src/services/agentOrchestrationState');

async function testWorkerEventIdentityBinding() {
  const orchestratorId = 'test-orch-identity';
  const workerA = 'worker-A';
  const workerB = 'worker-B';
  const run1 = 'run-attempt-1';
  const run2 = 'run-attempt-2';

  // Setup round
  workerEvidenceRounds.set(orchestratorId, {
    workerIds: new Set([workerA, workerB]),
    participants: new Map(),
    events: new Map()
  });
  activeWorkerBarriers.set(orchestratorId, {
    cancelled: false,
    workerIds: new Set([workerA, workerB])
  });

  const missionA = {
    orchestratorAgentId: orchestratorId,
    agentId: workerA,
    executionRunId: run1,
    name: 'Worker Alpha',
    role: 'worker'
  };

  // Case 1: Valid event for workerA on run1 is recorded
  const validEvent = {
    eventType: 'EVIDENCE_REPORT',
    agentId: workerA,
    action: 'REPORT',
    payload: {
      executionRunId: run1,
      workerId: workerA,
      evidenceReport: {
        outcome: 'success',
        claims: [{ statement: 'Alpha passed', evidence: ['receipt-1'] }]
      }
    }
  };
  recordWorkerEvidence(missionA, validEvent);

  let dossiers = workerEvidenceDossiers(orchestratorId, [{ agentId: workerA, name: 'Worker Alpha', role: 'worker' }]);
  let dossierA = dossiers.find((d) => d.workerId === workerA);
  assert.equal(dossierA.events.length, 1);
  assert.equal(dossierA.events[0].workerId, workerA);
  assert.equal(dossierA.events[0].executionRunId, run1);

  // Case 2: Event from workerB passed to workerA mission MUST be rejected (cross-worker leak)
  const spoofedWorkerEvent = {
    eventType: 'EVIDENCE_REPORT',
    agentId: workerB,
    action: 'REPORT',
    payload: {
      executionRunId: run1,
      workerId: workerB,
      evidenceReport: {
        outcome: 'success',
        claims: [{ statement: 'Beta passed but injected in Alpha', evidence: ['receipt-2'] }]
      }
    }
  };
  recordWorkerEvidence(missionA, spoofedWorkerEvent);

  // Must not have added to workerA's dossier
  dossiers = workerEvidenceDossiers(orchestratorId, [{ agentId: workerA, name: 'Worker Alpha', role: 'worker' }]);
  dossierA = dossiers.find((d) => d.workerId === workerA);
  assert.equal(dossierA.events.length, 1, 'Event from workerB must not be attributed to workerA');

  // Case 3: Event with mismatched executionRunId (different attempt) MUST be rejected
  const spoofedAttemptEvent = {
    eventType: 'EVIDENCE_REPORT',
    agentId: workerA,
    action: 'REPORT',
    payload: {
      executionRunId: run2, // Different attempt!
      workerId: workerA,
      evidenceReport: {
        outcome: 'success',
        claims: [{ statement: 'Old attempt claims', evidence: ['receipt-old'] }]
      }
    }
  };
  recordWorkerEvidence(missionA, spoofedAttemptEvent);

  dossiers = workerEvidenceDossiers(orchestratorId, [{ agentId: workerA, name: 'Worker Alpha', role: 'worker' }]);
  dossierA = dossiers.find((d) => d.workerId === workerA);
  assert.equal(dossierA.events.length, 1, 'Event from another attempt must not contaminate current attempt dossier');

  // Case 4: validateWorkerDossierCoherence rejects foreign worker in events
  const contaminatedDossier = {
    workerId: workerA,
    events: [
      {
        workerId: workerB, // Foreign worker!
        executionRunId: run1,
        evidenceReport: { claims: [{ statement: 'Proof', evidence: ['rec'] }] }
      }
    ]
  };
  assert.throws(() => {
    validateWorkerDossierCoherence(contaminatedDossier, { agentId: workerA });
  }, (err) => err.code === 'WORKER_IDENTITY_MISMATCH');

  // Case 5: validateWorkerDossierCoherence rejects foreign attempt in events
  const wrongAttemptDossier = {
    workerId: workerA,
    events: [
      {
        workerId: workerA,
        executionRunId: run2, // Foreign attempt!
        evidenceReport: { claims: [{ statement: 'Proof', evidence: ['rec'] }] }
      }
    ]
  };
  assert.throws(() => {
    validateWorkerDossierCoherence(wrongAttemptDossier, { agentId: workerA, executionRunId: run1 });
  }, (err) => err.code === 'WORKER_ATTEMPT_MISMATCH');

  // Cleanup
  workerEvidenceRounds.delete(orchestratorId);
  activeWorkerBarriers.delete(orchestratorId);

  console.log('Worker event identity binding & attempt isolation: PASS');
}

testWorkerEventIdentityBinding().catch((err) => {
  console.error(err);
  process.exit(1);
});
