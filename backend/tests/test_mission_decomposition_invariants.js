const assert = require('assert');
const { validateWorkerDossiers, validateDossierInfluence, extractEvidenceReport, recordWorkerEvidence, workerEvidenceDossiers } = require('../src/services/agentEvidenceService');
const { workerEvidenceRounds } = require('../src/services/agentOrchestrationState');
const { buildStrategyContract, validateContract } = require('../src/services/strategyContractService');
const { buildAutonomyPlan } = require('../src/services/autonomousOrchestrationService');

// Test extractEvidenceReport with unwrapped report
const unwrapped = { outcome: 'success', claims: [{ statement: 'Verified' }] };
assert.deepEqual(extractEvidenceReport(unwrapped), unwrapped);
assert.deepEqual(extractEvidenceReport({ evidenceReport: unwrapped }), unwrapped);
assert.deepEqual(extractEvidenceReport({ report: unwrapped }), unwrapped);

// Test recording unwrapped evidence into workerEvidenceRounds
workerEvidenceRounds.set('orch-1', {
  workerIds: new Set(['worker-1']),
  participants: new Map([['worker-1', { workerId: 'worker-1', role: 'specialist', assignedBranch: 'branch-1' }]]),
  events: new Map()
});
recordWorkerEvidence({ orchestratorAgentId: 'orch-1', agentId: 'worker-1' }, {
  eventType: 'EVIDENCE_REPORT',
  action: 'VERIFY_CLAIMS',
  payload: unwrapped
});
const dossiers = workerEvidenceDossiers('orch-1', [{ agentId: 'worker-1' }]);
assert.equal(dossiers.length, 1);
assert.ok(dossiers[0].events[0].evidenceReport, 'evidenceReport must be preserved even from direct payload');
validateWorkerDossiers(dossiers, [{ agentId: 'worker-1' }]);
// Test recording apoptosis event into workerEvidenceRounds
workerEvidenceRounds.set('orch-apop', {
  workerIds: new Set(['worker-apop']),
  participants: new Map([['worker-apop', { workerId: 'worker-apop', role: 'specialist', assignedBranch: 'branch-apop' }]]),
  events: new Map()
});
recordWorkerEvidence({ orchestratorAgentId: 'orch-apop', agentId: 'worker-apop' }, {
  eventType: 'APOPTOSIS_TRIGGERED',
  action: 'HALLUCINATION_LIMIT',
  detail: 'Hallucination limit reached',
  payload: { autopsy: { triggerReason: 'Hallucination threshold breached' } }
});
const apopDossiers = workerEvidenceDossiers('orch-apop', [{ agentId: 'worker-apop' }]);
assert.equal(apopDossiers.length, 1);
assert.equal(apopDossiers[0].events[0].failure?.category, 'apoptosis');
assert.equal(apopDossiers[0].events[0].failure?.reason, 'Hallucination limit reached');
validateWorkerDossiers(apopDossiers, [{ agentId: 'worker-apop' }]);
workerEvidenceRounds.delete('orch-apop');
workerEvidenceRounds.delete('orch-1');

assert.throws(
  () => validateWorkerDossiers([{ workerId: 'worker-a', events: [] }], [{ agentId: 'worker-a' }, { agentId: 'worker-b' }]),
  (error) => error.code === 'INCOMPLETE_WORKER_EVIDENCE'
);
assert.throws(
  () => validateDossierInfluence({ dossierInfluence: [{ workerId: 'worker-a', influence: '', usedClaims: [] }] }, ['worker-a']),
  (error) => error.code === 'INVALID_DOSSIER_INFLUENCE'
);
// Test shallow/punctuation-only influence rejection
assert.throws(
  () => validateDossierInfluence({ dossierInfluence: [{ workerId: 'worker-a', influence: '...', usedClaims: [] }] }, ['worker-a']),
  (error) => error.code === 'INVALID_DOSSIER_INFLUENCE'
);
// Test invalid non-string items in usedClaims
assert.throws(
  () => validateDossierInfluence({ dossierInfluence: [{ workerId: 'worker-a', influence: 'Valid constraint', usedClaims: [123] }] }, ['worker-a']),
  (error) => error.code === 'INVALID_DOSSIER_INFLUENCE'
);
// Test unexpected worker rejection
assert.throws(
  () => validateDossierInfluence({ dossierInfluence: [
    { workerId: 'worker-a', influence: 'Valid constraint', usedClaims: ['c1'] },
    { workerId: 'worker-phantom', influence: 'Valid constraint', usedClaims: ['c2'] }
  ] }, ['worker-a']),
  (error) => error.code === 'INVALID_DOSSIER_INFLUENCE'
);

const contract = buildStrategyContract({ problem: 'Build and test a service.' });
assert.throws(() => validateContract({ ...contract, branches: [] }), /at least one hypothesis/);
const plan = buildAutonomyPlan(contract, { tokens: 100, minimumWorkerTokens: 8000 });
assert.equal(plan.dispatchDecision.status, 'deferred');
assert.equal(plan.dispatchDecision.selectedWorkers, 0);

console.log('Mission decomposition invariants: ok');
