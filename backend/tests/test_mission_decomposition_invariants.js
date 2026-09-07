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
workerEvidenceRounds.delete('orch-1');

assert.throws(
  () => validateWorkerDossiers([{ workerId: 'worker-a', events: [] }], [{ agentId: 'worker-a' }, { agentId: 'worker-b' }]),
  (error) => error.code === 'INCOMPLETE_WORKER_EVIDENCE'
);
assert.throws(
  () => validateDossierInfluence({ dossierInfluence: [{ workerId: 'worker-a', influence: '', usedClaims: [] }] }, ['worker-a']),
  (error) => error.code === 'INVALID_DOSSIER_INFLUENCE'
);

const contract = buildStrategyContract({ problem: 'Build and test a service.' });
assert.throws(() => validateContract({ ...contract, branches: [] }), /at least one hypothesis/);
const plan = buildAutonomyPlan(contract, { tokens: 100, minimumWorkerTokens: 8000 });
assert.equal(plan.dispatchDecision.status, 'deferred');
assert.equal(plan.dispatchDecision.selectedWorkers, 0);

console.log('Mission decomposition invariants: ok');
