const assert = require('node:assert/strict');

process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'orchestrator-integration-test';
process.env.GENOS_MAX_ACTIVE_WORKERS = '3';

const { buildAutonomyPlan } = require('../src/services/autonomousOrchestrationService');
const { classifyFailure, failureReport, decideRecovery, recoveryPrompt } = require('../src/services/workerFailureRecoveryService');
const { resolveTimeoutFlag, resolveCancelledFlag } = require('../src/services/workerEvidenceBarrier');

const mockContract = {
  strategy_portfolio: [
    { id: 'tree_search', primitives: ['fork', 'snapshot', 'replay', 'hypothesis_evidence', 'evaluate_trajectories', 'adversarial_review'] },
    { id: 'adversarial_review', primitives: ['adversarial_review'] }
  ],
  problem_profile: { risk: 'medium', complexity: 0.5, uncertainty: 0.4, type: 'general' },
  branches: [
    { label: 'hypothesis_a', hypothesis: 'Approach A works' },
    { label: 'hypothesis_b', hypothesis: 'Approach B works' }
  ],
  stop_conditions: []
};

async function testAutonomyPlanBuilding() {
  console.log('Testing autonomy plan building...');
  const budget = { tokens: 50000, workerShare: 0.6, minimumWorkerTokens: 1000 };
  const plan = buildAutonomyPlan(mockContract, budget);
  
  assert.ok(plan.workers.length >= 1, 'Should have at least one worker');
  assert.ok(plan.dispatchWorkers.length >= 1, 'Should dispatch at least one worker');
  assert.ok(plan.phases.length >= 1, 'Should have realizable phases');
  assert.ok(plan.tokenPolicy.rounds, 'Should have token rounds');
  assert.ok(plan.competition, 'Should have competition config');
  assert.ok(plan.evolution, 'Should have evolution config');
  assert.ok(plan.parasitism, 'Should have parasitism config');
  assert.ok(plan.survival, 'Should have survival constraints');
  assert.ok(plan.remediation === null || plan.remediation.missingTools, 'Remediation should be null or have missingTools');
  
  console.log('  Autonomy plan building test passed');
}

async function testBudgetInheritanceCalculation() {
  console.log('Testing budget inheritance calculation...');
  const { calculateInheritedCognitiveBudget } = require('../src/services/agentFleetWorkers');
  
  const budget1 = calculateInheritedCognitiveBudget(100, 0.6, 2);
  assert.equal(budget1, 30, 'Budget should be 100 * 0.6 / 2 = 30');
  
  const budget2 = calculateInheritedCognitiveBudget(200, 0.5, 4);
  assert.equal(budget2, 25, 'Budget should be 200 * 0.5 / 4 = 25');
  
  const budget3 = calculateInheritedCognitiveBudget(100, 0.0, 1);
  assert.equal(budget3, 0, 'Budget should be 0 with 0 share');
  
  console.log('  Budget inheritance calculation test passed');
}

async function testWorkerFailureRecovery() {
  console.log('Testing worker failure recovery flow...');
  
  const event = {
    eventType: 'WORKER_TASK_FAILED',
    detail: 'Test failure',
    payload: { failure: { category: 'test_failure', reason: 'Tests failed', evidence: [] } }
  };
  
  const mission = { agentId: 'test-worker-1', originalMission: 'Test mission', orchestratorAgentId: 'test-orchestrator' };
  const report = failureReport(event, mission);
  
  assert.equal(report.category, 'test_failure');
  assert.equal(report.workerId, 'test-worker-1');
  assert.equal(report.orchestratorId, 'test-orchestrator');
  assert.equal(report.attempt, 0);
  assert.equal(report.maxAttempts, 3);
  
  const decision = decideRecovery(report);
  assert.ok(['mutate_worker', 'fork_worker', 'bisect_and_rollback', 'replace_worker'].includes(decision.action));
  assert.ok(typeof decision.reason === 'string');
  
  const prompt = recoveryPrompt(report, decision);
  assert.ok(prompt.includes('Recovery attempt'));
  assert.ok(prompt.includes('Test mission'));
  assert.ok(prompt.includes(decision.action));
  
  console.log('  Worker failure recovery test passed');
}

async function testRecoveryPromptSizeGuard() {
  console.log('Testing recovery prompt size guard...');
  const longReason = 'x'.repeat(2000000);
  const event = {
    eventType: 'WORKER_TASK_FAILED',
    detail: 'Test failure',
    payload: { failure: { category: 'test_failure', reason: longReason, evidence: [] } }
  };
  const mission = { agentId: 'test-worker-1', originalMission: 'Test mission', orchestratorAgentId: 'test-orchestrator' };
  const report = failureReport(event, mission);
  const decision = decideRecovery(report);
  const prompt = recoveryPrompt(report, decision);
  
  const maxChars = 1024 * 1024;
  assert.ok(prompt.length <= maxChars + 500, 'Prompt should be truncated at maxProcessOutputBytes');
  if (prompt.length >= maxChars - 500) {
    assert.ok(prompt.includes('PROMPT TRUNCATED'));
  }
  
  console.log('  Recovery prompt size guard test passed');
}

async function testFailureClassification() {
  console.log('Testing failure classification...');
  
  const permissionEvent = { payload: { failure: { category: 'capability_mismatch' } } };
  assert.equal(classifyFailure(permissionEvent), 'capability_mismatch');
  
  const testEvent = { payload: { failure: { category: 'test_failure' } } };
  assert.equal(classifyFailure(testEvent), 'test_failure');
  
  const mutationEvent = { payload: { failure: { category: 'mutated_output' } } };
  assert.equal(classifyFailure(mutationEvent), 'mutated_output');
  
  const hypothesisEvent = { payload: { failure: { category: 'falsified_hypothesis' } } };
  assert.equal(classifyFailure(hypothesisEvent), 'falsified_hypothesis');
  
  const timeoutEvent = { payload: { stderr: 'connection timeout' } };
  assert.equal(classifyFailure(timeoutEvent), 'transient_runtime');
  
  const declaredEvent = { payload: { failure: { category: 'permission_denied' } } };
  assert.equal(classifyFailure(declaredEvent), 'permission_denied');
  
  console.log('  Failure classification test passed');
}

async function testPartialBarrierTimeout() {
  console.log('Testing partial barrier timeout distinction...');
  
  const timeoutError = new Error('Worker evidence barrier timed out');
  timeoutError.code = 'WORKER_BARRIER_TIMEOUT';
  
  const errorError = new Error('Worker failed');
  errorError.code = 'WORKER_TASK_FAILED';
  
  assert.equal(resolveTimeoutFlag(timeoutError), true, 'Should detect timeout');
  assert.equal(resolveTimeoutFlag(errorError), false, 'Should not detect timeout for other errors');
  assert.equal(resolveCancelledFlag(timeoutError), false, 'Should not detect cancel for timeout');
  
  console.log('  Partial barrier timeout test passed');
}

async function testDecisionRecoveryLogic() {
  console.log('Testing recovery decision logic...');
  
  const report1 = { category: 'capability_mismatch', attempt: 0, maxAttempts: 3, noAnswerProof: null };
  const decision1 = decideRecovery(report1);
  assert.equal(decision1.action, 'replace_worker');
  
  const report2 = { category: 'mutated_output', attempt: 0, maxAttempts: 3, noAnswerProof: null };
  const decision2 = decideRecovery(report2);
  assert.equal(decision2.action, 'mutate_worker');
  
  const report3 = { category: 'test_failure', attempt: 0, maxAttempts: 3, noAnswerProof: null };
  const decision3 = decideRecovery(report3);
  assert.equal(decision3.action, 'bisect_and_rollback');
  
  const report4 = { category: 'falsified_hypothesis', attempt: 0, maxAttempts: 3, noAnswerProof: null };
  const decision4 = decideRecovery(report4);
  assert.equal(decision4.action, 'fork_worker');
  
  const report5 = { category: 'unknown', attempt: 0, maxAttempts: 3, noAnswerProof: null };
  const decision5 = decideRecovery(report5);
  assert.equal(decision5.action, 'mutate_worker');
  
  const report6 = { category: 'unknown', attempt: 1, maxAttempts: 3, noAnswerProof: null };
  const decision6 = decideRecovery(report6);
  assert.equal(decision6.action, 'fork_worker');
  
  const report7 = { category: 'unknown', attempt: 2, maxAttempts: 3, noAnswerProof: null };
  const decision7 = decideRecovery(report7);
  assert.equal(decision7.action, 'replace_worker');
  
  console.log('  Recovery decision logic test passed');
}

async function testNoAnswerProofHandling() {
  console.log('Testing noAnswerProof handling...');
  
  const { proofOfNoAnswer } = require('../src/services/workerFailureRecoveryService');
  
  const validProof = { method: 'exhaustive_search', evidence: ['checked_all_sources', 'no_results'] };
  const proof1 = proofOfNoAnswer({ noAnswerProof: validProof });
  assert.ok(proof1 !== null);
  assert.equal(proof1.method, 'exhaustive_search');
  assert.equal(proof1.evidence.length, 2);
  
  const emptyProof = { noAnswerProof: { method: '', evidence: [] } };
  const proof2 = proofOfNoAnswer(emptyProof);
  assert.equal(proof2, null);
  
  const noMethodProof = { noAnswerProof: { method: 'search', evidence: [] } };
  const proof3 = proofOfNoAnswer(noMethodProof);
  assert.equal(proof3, null);
  
  console.log('  NoAnswerProof handling test passed');
}

async function runAllTests() {
  try {
    await testAutonomyPlanBuilding();
    await testBudgetInheritanceCalculation();
    await testWorkerFailureRecovery();
    await testRecoveryPromptSizeGuard();
    await testFailureClassification();
    await testPartialBarrierTimeout();
    await testDecisionRecoveryLogic();
    await testNoAnswerProofHandling();
    console.log('\n✅ All orchestrator integration tests passed!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

runAllTests();