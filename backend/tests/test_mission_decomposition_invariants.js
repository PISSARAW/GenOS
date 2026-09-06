const assert = require('assert');
const { validateWorkerDossiers, validateDossierInfluence } = require('../src/services/agentEvidenceService');
const { buildStrategyContract, validateContract } = require('../src/services/strategyContractService');
const { buildAutonomyPlan } = require('../src/services/autonomousOrchestrationService');

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
