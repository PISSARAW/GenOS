const assert = require('node:assert/strict');
const evidence = require('../src/services/agentEvidenceService');
const { workerEvidenceRounds } = require('../src/services/agentOrchestrationState');

workerEvidenceRounds.set('orch-retention', { participants: new Map(), events: new Map() });
for (let index = 0; index < evidence.MAX_WORKER_DOSSIER_EVENTS + 5; index++) {
  evidence.recordWorkerEvidence(
    { agentId: 'worker-retention', orchestratorAgentId: 'orch-retention', role: 'reviewer' },
    { eventType: 'EVIDENCE_REPORT', action: 'REPORT', detail: `step-${index}`, payload: { claims: [{ statement: `claim-${index}`, evidence: [`proof-${index}`] }] } }
  );
}
const dossier = evidence.workerEvidenceDossiers('orch-retention', [{ agentId: 'worker-retention', role: 'reviewer' }])[0];
assert.equal(dossier.events.length, evidence.MAX_WORKER_DOSSIER_EVENTS);
assert.equal(dossier.events[0].detail, 'step-5');
workerEvidenceRounds.delete('orch-retention');
console.log('Worker evidence retention checks passed.');