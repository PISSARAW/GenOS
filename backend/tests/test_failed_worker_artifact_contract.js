'use strict';

const assert = require('node:assert/strict');
const { validateWorkerDossiers } = require('../src/services/agentEvidence/dossierValidation');

const worker = {
  agentId: 'resource-steward-retry',
  workerContract: {
    identity: { workerKind: 'scout_cell' },
    evidence: { requiredArtifacts: ['dossier'] }
  }
};

const unresolved = [{
  workerId: worker.agentId,
  events: [{
    eventType: 'AGENT_FAILED',
    evidenceReport: { outcome: 'unresolved', claims: [], uncertainties: ['Budget exhausted.'] }
  }]
}];

assert.equal(validateWorkerDossiers(unresolved, [worker]), true,
  'An unresolved worker report is a valid failure record, not a successful artifact.');

const invalidSuccess = [{
  workerId: worker.agentId,
  events: [{
    eventType: 'AGENT_COMPLETED',
    evidenceReport: { outcome: 'success', claims: [{ statement: 'Allocated items.' }] }
  }]
}];

assert.throws(() => validateWorkerDossiers(invalidSuccess, [worker]),
  { code: 'INVALID_WORKER_ARTIFACT' }, 'Successful reports still require the contracted artifact and provenance.');

console.log('Failed worker reports bypass success-artifact checks; invalid successes remain rejected: PASS');
