const assert = require('node:assert/strict');
const path = require('node:path');
const { validateBudgetCoherence } = require('../src/services/budgetCoherenceService');
const { buildAutonomyPlan } = require('../src/services/autonomousOrchestrationService');
const agentConscience = require('../src/services/agentConscienceService');
const { advanceAutonomousRound } = require('../src/services/agentRoundService');
const {
  autonomousRounds, pendingContinuations, activeProcesses, missionStarts
} = require('../src/services/agentOrchestrationState');

async function testPoint1_budgetCoherenceScopes() {
  // Test mission scope
  const missionOk = validateBudgetCoherence({
    executionBudget: { tokens: 500000 },
    autonomyPlan: { tokenPolicy: { total: 500000, workerShare: 0.6, orchestratorReserve: 0.4 } },
    scope: 'mission'
  });
  assert.equal(missionOk.valid, true);

  const missionFail = validateBudgetCoherence({
    executionBudget: { tokens: 300000 },
    autonomyPlan: { tokenPolicy: { total: 500000, workerShare: 0.6, orchestratorReserve: 0.4 } },
    scope: 'mission'
  });
  assert.equal(missionFail.valid, false);

  // Test orchestrator scope: orchestrator receives 200,000 tokens (40% of 500,000 total)
  const orchestratorOk = validateBudgetCoherence({
    executionBudget: { tokens: 200000 },
    autonomyPlan: { tokenPolicy: { total: 500000, workerShare: 0.6, orchestratorReserve: 0.4 } },
    scope: 'orchestrator'
  });
  assert.equal(orchestratorOk.valid, true, `Expected orchestrator budget to be valid: ${orchestratorOk.reason}`);

  // Orchestrator exceeding reserve allocation should fail
  const orchestratorExceed = validateBudgetCoherence({
    executionBudget: { tokens: 350000 },
    autonomyPlan: { tokenPolicy: { total: 500000, workerShare: 0.6, orchestratorReserve: 0.4 } },
    scope: 'orchestrator'
  });
  assert.equal(orchestratorExceed.valid, false);

  // Test worker scope: worker receives 100,000 tokens (less than 500,000 total)
  const workerOk = validateBudgetCoherence({
    executionBudget: { tokens: 100000 },
    autonomyPlan: { tokenPolicy: { total: 500000, workerShare: 0.6, orchestratorReserve: 0.4 } },
    scope: 'worker'
  });
  assert.equal(workerOk.valid, true);

  console.log('✓ Point 1: Budget coherence scopes (mission, orchestrator, worker) verified.');
}

async function testPoint2_configurableWorkerShare() {
  const contract = {
    schema: 'genos.strategy-contract/v1alpha1',
    problem_profile: { complexity: 0.8, risk: 'low', uncertainty: 0.7 },
    branches: [
      { label: 'b1', hypothesis: 'h1' },
      { label: 'b2', hypothesis: 'h2' }
    ]
  };

  // Custom budget with workerShare: 0.7, orchestratorReserve: 0.3
  const customBudget = {
    tokens: 400000,
    workerShare: 0.7,
    orchestratorReserve: 0.3,
    minimumWorkerTokens: 10000
  };

  const plan = buildAutonomyPlan(contract, customBudget);
  assert.equal(plan.tokenPolicy.workerShare, 0.7);
  assert.equal(plan.tokenPolicy.orchestratorReserve, 0.3);
  assert.equal(plan.tokenPolicy.total, 400000);

  // Max affordable workers: 400000 * 0.7 / 10000 = 28 workers capacity
  assert.equal(plan.dispatchWorkers.length, 2);

  console.log('✓ Point 2: Configurable workerShare and orchestratorReserve verified.');
}

async function testPoint3_continuationBudgetDeductions() {
  const orchestratorId = 'orch_round_test_' + Date.now();
  const worker1Id = 'w1_' + Date.now();
  const worker2Id = 'w2_' + Date.now();

  const roundState = {
    orchestratorId,
    advanced: false,
    workerIds: new Set([worker1Id, worker2Id]),
    results: new Map(),
    workers: new Map([
      [worker1Id, {
        agentId: worker1Id,
        orchestratorAgentId: orchestratorId,
        prompt: 'Initial worker 1 task',
        executionBudget: { tokens: 50000, events: 100, costUsd: 5.0 }
      }],
      [worker2Id, {
        agentId: worker2Id,
        orchestratorAgentId: orchestratorId,
        prompt: 'Initial worker 2 task',
        executionBudget: { tokens: 50000, events: 100, costUsd: 5.0 }
      }]
    ]),
    plan: {
      tokenPolicy: {
        allocation: 'successive_halving_with_reallocation',
        rounds: {
          continuation: {
            survivorCount: 1,
            perWorkerTokens: 60000
          }
        }
      }
    }
  };

  autonomousRounds.set(orchestratorId, roundState);

  // Worker 1 finishes having consumed 25 events and $1.50
  const mission1 = {
    agentId: worker1Id,
    budgetRound: { stage: 'initial', orchestratorId }
  };
  const event1 = {
    eventType: 'AGENT_COMPLETED',
    payload: {
      evidenceReport: {
        claims: [{ statement: 'Tested hypothesis 1', evidence: ['trace log'] }],
        uncertainties: []
      },
      usage: { events: 25, cost_usd: 1.50 }
    }
  };

  // Worker 2 finishes having consumed 40 events and $2.00
  const mission2 = {
    agentId: worker2Id,
    budgetRound: { stage: 'initial', orchestratorId }
  };
  const event2 = {
    eventType: 'AGENT_COMPLETED',
    payload: {
      evidenceReport: {
        claims: [{ statement: 'Tested hypothesis 2' }],
        uncertainties: ['high uncertainty']
      },
      usage: { events: 40, cost_usd: 2.00 }
    }
  };

  // Mark worker 1 as active so dispatchPendingContinuation leaves it in pendingContinuations
  activeProcesses.set(worker1Id, { pid: 12345 });

  await advanceAutonomousRound(mission1, event1);
  await advanceAutonomousRound(mission2, event2);

  // Worker 1 should be selected as survivor because of higher evidence score
  const continuation = pendingContinuations.get(worker1Id);
  assert.ok(continuation, 'Continuation mission for worker 1 must be queued in pendingContinuations');
  assert.equal(continuation.executionBudget.tokens, 60000);
  assert.equal(continuation.executionBudget.events, 75, 'Events budget must deduct 25 consumed events (100 - 25 = 75)');
  assert.equal(continuation.executionBudget.costUsd, 3.50, 'Cost budget must deduct $1.50 consumed cost ($5.00 - $1.50 = $3.50)');

  // Clean up
  activeProcesses.delete(worker1Id);
  pendingContinuations.delete(worker1Id);
  pendingContinuations.delete(worker2Id);
  autonomousRounds.delete(orchestratorId);

  console.log('✓ Point 3: Successive-halving continuation budget deductions verified.');
}

async function testPoint4_conscienceEvaluationAndApoptosis() {
  const state = agentConscience.createConscienceState({
    currentBudget: 50.0,
    maxDissonanceThreshold: 40.0
  });

  // Evaluation with progress reduces dissonance and increases harmony
  const evalProgress = agentConscience.evaluateBranch(state, {
    errorsInLoop: 0,
    progressScore: 2.0,
    cognitiveHealth: { repetition_score: 0, semantic_drift: 0, health_score: 1.0 }
  });
  assert.equal(evalProgress.apoptoticTriggered, false);
  assert.equal(state.dissonanceLevel, 0);

  // Evaluation with mild errors increases dissonance without apoptosis
  const evalErrors = agentConscience.evaluateBranch(state, {
    errorsInLoop: 2,
    progressScore: 0,
    cognitiveHealth: { repetition_score: 0.2, semantic_drift: 0, health_score: 0.8 }
  });
  assert.equal(evalErrors.apoptoticTriggered, false);
  assert.ok(state.dissonanceLevel > 0, 'Dissonance must increase on consecutive errors');
  assert.ok(state.dissonanceLevel < state.maxDissonanceThreshold);

  // Triggering critical dissonance marks state as apoptotic
  const evalApoptosis = agentConscience.evaluateBranch(state, {
    errorsInLoop: 15,
    progressScore: 0,
    cognitiveHealth: { repetition_score: 0.8, semantic_drift: 2.0, health_score: 0.0 }
  });
  assert.equal(evalApoptosis.apoptoticTriggered, true, 'Apoptosis must trigger when max dissonance is exceeded');
  assert.equal(state.isApoptotic, true);
  assert.equal(state.currentBudget, 0);

  console.log('✓ Point 4: Conscience dynamic evaluation and apoptosis trigger verified.');
}

async function runAll() {
  console.log('--- Starting Cognitive Budget Remediation Test Suite ---');
  await testPoint1_budgetCoherenceScopes();
  await testPoint2_configurableWorkerShare();
  await testPoint3_continuationBudgetDeductions();
  await testPoint4_conscienceEvaluationAndApoptosis();
  console.log('=== All Cognitive Budget Remediation Tests Passed Successfully! ===');
}

runAll().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
