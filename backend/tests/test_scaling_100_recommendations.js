const assert = require('assert');
const path = require('path');

const agentEvidence = require('../src/services/agentEvidenceService');
const agentConscience = require('../src/services/agentConscienceService');
const { buildAutonomyPlan } = require('../src/services/autonomousOrchestrationService');
const { buildAllocation } = require('../src/services/tokenAllocationService');

async function run() {
  console.log('--- 1. Testing Adaptive validateDossierInfluence for Large Fleets ---');
  
  // A. Standard fleet (<= 12 workers): strict 1-to-1 requirement is preserved
  const smallWorkers = ['worker-1', 'worker-2'];
  const incompleteSmallReport = {
    dossierInfluence: [
      { workerId: 'worker-1', influence: 'Critical algorithm fix', usedClaims: ['fixed'] }
    ]
  };
  assert.throws(() => {
    agentEvidenceServiceValidate(incompleteSmallReport, smallWorkers);
  }, (err) => err.code === 'INVALID_DOSSIER_INFLUENCE', 'Small fleets must strictly require all workers');

  // B. Large fleet (e.g. 100 workers): sample of pivotal workers is accepted if citations are valid
  const largeWorkers = Array.from({ length: 100 }, (_, i) => `worker-${i + 1}`);
  const sampleDossiers = [
    {
      workerId: 'worker-1',
      events: [{ evidenceReport: { claims: [{ statement: 'claim-1' }] } }]
    },
    {
      workerId: 'worker-25',
      events: [{ evidenceReport: { claims: [{ statement: 'claim-25' }] } }]
    }
  ];
  const largeReport = {
    dossierInfluence: [
      { workerId: 'worker-1', influence: 'Provided primary database fix', usedClaims: ['claim-1'] },
      { workerId: 'worker-25', influence: 'Identified concurrency edge case', usedClaims: ['claim-25'] }
    ]
  };
  const validLarge = agentEvidence.validateDossierInfluence(largeReport, largeWorkers, { dossiers: sampleDossiers });
  assert.equal(validLarge, true, 'Large fleets should validate valid influence entries without requiring 100 entries');

  // C. Large fleet: invalid citation must still fail
  const invalidCitationReport = {
    dossierInfluence: [
      { workerId: 'worker-1', influence: 'Provided fix', usedClaims: ['fake-claim'] }
    ]
  };
  assert.throws(() => {
    agentEvidence.validateDossierInfluence(invalidCitationReport, largeWorkers, { dossiers: sampleDossiers });
  }, (err) => err.code === 'INVALID_DOSSIER_INFLUENCE', 'Invented claim citations in large fleet must still fail');

  // D. Large fleet: unexpected worker not in the fleet must still fail
  const unexpectedReport = {
    dossierInfluence: [
      { workerId: 'intruder-worker', influence: 'Hacked entry', usedClaims: [] }
    ]
  };
  assert.throws(() => {
    agentEvidence.validateDossierInfluence(unexpectedReport, largeWorkers, { dossiers: sampleDossiers });
  }, (err) => err.code === 'INVALID_DOSSIER_INFLUENCE', 'Unexpected worker in large fleet must fail');

  console.log('--- 2. Testing buildWorkerSynthesisPrompt for Large Fleets ---');
  const manyDossiers = Array.from({ length: 50 }, (_, i) => ({
    workerId: `worker-${i + 1}`,
    role: 'tester',
    assignedBranch: `branch-${i + 1}`,
    events: [{ evidenceReport: { outcome: 'success', claims: [] } }]
  }));
  const prompt = agentEvidence.buildWorkerSynthesisPrompt('Original user task', manyDossiers);
  assert.ok(prompt.includes('MANDATORY FINAL SYNTHESIS PHASE'));
  assert.ok(prompt.includes('key contributing, pivotal, or rejected workers'));
  assert.ok(prompt.includes('tissue_cluster_1'));

  const clusters = agentEvidence.clusterWorkerDossiers(manyDossiers, 10);
  assert.equal(clusters.length, 5, `Expected 5 clusters of 10 workers for 50 dossiers, got ${clusters.length}`);
  assert.equal(clusters[0].clusterId, 'tissue_cluster_1');
  assert.equal(clusters[0].workerCount, 10);
  assert.equal(clusters[0].workerIds.length, 10);

  console.log('--- 3. Testing Token Allocation Scaling for 100 Workers ---');
  // Plan with 100 branches
  process.env.GENOS_MAX_WORKERS = '100';
  const contract = {
    problem_profile: { complexity: 0.9 },
    branches: Array.from({ length: 100 }, (_, i) => ({ label: `branch-${i + 1}`, hypothesis: `hyp-${i + 1}` }))
  };
  const plan = buildAutonomyPlan(contract);
  assert.ok(plan.dispatchWorkers.length === 100, `Expected 100 workers dispatched, got ${plan.dispatchWorkers.length}`);
  assert.ok(plan.tokenPolicy.total >= 2000000, `Expected totalTokens >= 2M, got ${plan.tokenPolicy.total}`);
  assert.ok(plan.tokenPolicy.minimumWorkerTokens <= 1000, `Expected minimumWorkerTokens <= 1000, got ${plan.tokenPolicy.minimumWorkerTokens}`);
  assert.ok(plan.tokenPolicy.rounds.initial.workerCount === 100, `Initial round should have 100 workers allocated`);

  console.log('--- 4. Testing Queue-Wait Immunity in Conscience Service ---');
  const conscienceState = agentConscience.createConscienceState();
  const initialBudget = conscienceState.currentBudget;
  const initialDissonance = conscienceState.dissonanceLevel;

  // Evaluate while in queue
  const queueEval = agentConscience.evaluateBranch(conscienceState, { inQueue: true, errorsInLoop: 5 });
  assert.equal(conscienceState.currentBudget, initialBudget, 'Budget must not be decremented while inQueue');
  assert.equal(conscienceState.dissonanceLevel, initialDissonance, 'Dissonance must not increase while inQueue');
  assert.equal(queueEval.apoptoticTriggered, false);

  console.log('All scaling recommendation tests passed successfully!');
}

function agentEvidenceServiceValidate(report, workerIds) {
  return agentEvidence.validateDossierInfluence(report, workerIds, {
    dossiers: workerIds.map((id) => ({ workerId: id, events: [] }))
  });
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
