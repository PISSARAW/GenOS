/**
 * GenOS Chaos Engineering, Self-Healing & System Resilience Benchmark
 * Evaluates worker crash recovery, anti-poison cycle detection, somatic hypermutation,
 * adaptive apoptosis autopsy, circuit breaker quarantine, and cryptobiotic state restoration.
 *
 * 1. Multi-Taxonomy Failure Classification & Deterministic Remediation
 * 2. Toxic Loop Interception & Recovery Cycle Detection
 * 3. Somatic Hypermutation to Break Reflexive Reasoning Deadlocks
 * 4. Multi-Criteria Adaptive Apoptosis & Autopsy Telemetry
 * 5. 3-State Sliding Window Circuit Breaker & Military Emergency Halt
 * 6. Cryptobiosis & Deterministic State Restoration under Catastrophic Shock
 */

const assert = require('assert');
const {
  classifyFailure,
  decideRecovery,
  failureReport,
  proofOfNoAnswer
} = require('../../src/services/workerFailureRecoveryService');
const { queueWorkerRecovery } = require('../../src/services/agentRecoveryService');
const {
  somaticHypermutationPrompt,
  evaluateApoptosis,
  freezeCryptobiosis,
  thawCryptobiosis
} = require('../../src/services/resilienceService');
const circuitBreaker = require('../../src/services/circuitBreaker');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result
        .then(() => {
          passed += 1;
          console.log(`  [PASS] ${name}`);
        })
        .catch((err) => {
          failed += 1;
          console.error(`  [FAIL] ${name}: ${err.message}`);
        });
    }
    passed += 1;
    console.log(`  [PASS] ${name}`);
    return Promise.resolve();
  } catch (err) {
    failed += 1;
    console.error(`  [FAIL] ${name}: ${err.message}`);
    return Promise.resolve();
  }
}

async function testFailureClassificationAndRemediation() {
  console.log('\n--- Challenge 1: Multi-Taxonomy Failure Classification & Remediation ---');
  console.log('  Competitor Failure: Blind retries or unhandled orchestrator crashes on worker failure.');

  await runTest('1.1 classifyFailure categorizes errors across diverse failure taxonomies', () => {
    const testCases = [
      { event: { detail: 'AssertionError: npm test exited with code 1' }, expected: 'test_failure' },
      { event: { detail: 'Permission denied: tool execution not allowed by policy' }, expected: 'capability_mismatch' },
      { event: { detail: 'chaperone repair triggered: mutated output structure' }, expected: 'mutated_output' },
      { event: { detail: 'Contradictory evidence: hypothesis falsified by test' }, expected: 'falsified_hypothesis' },
      { event: { detail: 'ECONNRESET: transient rate limit timeout' }, expected: 'transient_runtime' }
    ];
    for (const { event, expected } of testCases) {
      const category = classifyFailure(event);
      assert.strictEqual(category, expected, `Expected ${expected} but got ${category}`);
    }
  });

  await runTest('1.2 decideRecovery assigns specialized architectural recovery actions', () => {
    const testDecisions = [
      { report: { category: 'test_failure', attempt: 0, maxAttempts: 3 }, action: 'bisect_and_rollback' },
      { report: { category: 'capability_mismatch', attempt: 0, maxAttempts: 3 }, action: 'replace_worker' },
      { report: { category: 'mutated_output', attempt: 0, maxAttempts: 3 }, action: 'mutate_worker' },
      { report: { category: 'falsified_hypothesis', attempt: 0, maxAttempts: 3 }, action: 'fork_worker' }
    ];
    for (const { report, action } of testDecisions) {
      const decision = decideRecovery(report);
      assert.strictEqual(decision.action, action, `Expected ${action} for ${report.category}`);
      assert.strictEqual(decision.retry, true);
    }
  });

  await runTest('1.3 decideRecovery enforces progressive fallback and bounded budget escalation', () => {
    const attempt0 = decideRecovery({ category: 'unresolved_task', attempt: 0, maxAttempts: 3 });
    const attempt1 = decideRecovery({ category: 'unresolved_task', attempt: 1, maxAttempts: 3 });
    const attempt2 = decideRecovery({ category: 'unresolved_task', attempt: 2, maxAttempts: 3 });
    const exhausted = decideRecovery({ category: 'unresolved_task', attempt: 3, maxAttempts: 3 });

    assert.strictEqual(attempt0.action, 'mutate_worker');
    assert.strictEqual(attempt1.action, 'fork_worker');
    assert.strictEqual(attempt2.action, 'replace_worker');
    assert.strictEqual(exhausted.action, 'escalate_unresolved');
    assert.strictEqual(exhausted.terminal, true);
    assert.strictEqual(exhausted.retry, false);
  });
}

async function testToxicLoopAndRecoveryCycleDetection() {
  console.log('\n--- Challenge 2: Toxic Loop Interception & Recovery Cycles ---');
  console.log('  Competitor Failure: Poison pills trigger endless crash loops without strategy pivot.');

  await runTest('2.1 queueWorkerRecovery detects recurring recovery cycles and escalates', () => {
    const mission = {
      id: 'worker_poison_pill',
      orchestratorAgentId: 'orch_root',
      prompt: 'Fix critical database deadlock',
      recoveryHistory: [{ category: 'test_failure', action: 'bisect_and_rollback' }]
    };
    const event = { detail: 'npm test assertion failed', eventType: 'WORKER_FAILED' };
    const result = queueWorkerRecovery(mission, event);

    assert.strictEqual(result.cycleDetected, true);
    assert.strictEqual(result.decision.action, 'escalate_recovery_cycle');
    assert.strictEqual(result.decision.terminal, true);
    assert.strictEqual(result.queued, false);
  });

  await runTest('2.2 queueWorkerRecovery deduplicates concurrent recovery requests for same worker', () => {
    const mission = {
      id: 'worker_dedup',
      orchestratorAgentId: 'orch_root',
      prompt: 'Refactor auth controller'
    };
    const event = { detail: 'Syntax error in controller', eventType: 'WORKER_FAILED' };
    const firstCall = queueWorkerRecovery(mission, event);
    assert.strictEqual(firstCall.queued, true);

    const secondCall = queueWorkerRecovery(mission, event);
    assert.strictEqual(secondCall.duplicate, true);
    assert.strictEqual(secondCall.queued, false);
  });

  await runTest('2.3 decideRecovery accepts evidence-backed no_answer proof to prevent futile retries', () => {
    const reportWithProof = {
      category: 'unresolved_task',
      attempt: 1,
      maxAttempts: 3,
      noAnswerProof: { method: 'exhaustive_code_scan', evidence: ['All references checked'] }
    };
    const decision = decideRecovery(reportWithProof);
    assert.strictEqual(decision.action, 'conclude_no_answer');
    assert.strictEqual(decision.terminal, true);
    assert.strictEqual(decision.retry, false);
  });
}

async function testSomaticHypermutation() {
  console.log('\n--- Challenge 3: Somatic Hypermutation to Break Reasoning Deadlocks ---');
  console.log('  Competitor Failure: Repeats identical deadlocked instructions in circular loops.');

  await runTest('3.1 somaticHypermutationPrompt mutates key action verbs with measurable drift', () => {
    const prompt = 'Always verify the execution result and never execute without safety checks.';
    const result = somaticHypermutationPrompt(prompt, 0.9, { seed: 'chaos_seed_1' });

    assert.ok(result.mutatedCount > 0, 'Should mutate at least one keyword');
    assert.ok(result.drift > 0, 'Drift score must be greater than 0');
    assert.notStrictEqual(result.mutatedPrompt, prompt, 'Prompt should be materially altered');
  });

  await runTest('3.2 somaticHypermutationPrompt injects guidance directives on low mutation count', () => {
    const neutralPrompt = 'Check the database connection status.';
    const result = somaticHypermutationPrompt(neutralPrompt, 0.05, { seed: 'chaos_seed_2', forcePerturbation: true });

    assert.ok(result.mutatedPrompt.includes('Somatic Hypermutation Directive'), 'Must contain directive');
    assert.ok(result.mutatedCount >= 1);
  });

  await runTest('3.3 somaticHypermutationPrompt handles empty or whitespace input gracefully', () => {
    const emptyResult = somaticHypermutationPrompt('   ', 0.5);
    assert.strictEqual(emptyResult.mutatedCount, 0);
    assert.strictEqual(emptyResult.drift, 0);
  });
}

async function testAdaptiveApoptosisAndAutopsy() {
  console.log('\n--- Challenge 4: Multi-Criteria Adaptive Apoptosis & Autopsy ---');
  console.log('  Competitor Failure: Runaway agents burn unbounded compute without self-termination.');

  await runTest('4.1 evaluateApoptosis triggers on consecutive failures or repeated hallucinations', async () => {
    const failureReportResult = await evaluateApoptosis('agent_fail_test', { consecutiveFailures: 4 }, null, { maxConsecutiveFailures: 3 });
    assert.strictEqual(failureReportResult.apoptosisExecuted, true);
    assert.ok(failureReportResult.triggerReason.includes('Consecutive tool failure threshold exceeded'));

    const hallucinationReport = await evaluateApoptosis('agent_hal_test', { hallucinations: 2 });
    assert.strictEqual(hallucinationReport.apoptosisExecuted, true);
    assert.ok(hallucinationReport.triggerReason.includes('Unverified hallucination limit breached'));
  });

  await runTest('4.2 evaluateApoptosis triggers when conscience dissonance exceeds threshold', async () => {
    const dissonanceReport = await evaluateApoptosis(
      'agent_dissonance_test',
      { consecutiveFailures: 2, repetitionScore: 0.25, semanticDivergence: 0.5 },
      null,
      { maxDissonanceThreshold: 15.0 }
    );
    assert.strictEqual(dissonanceReport.apoptosisExecuted, true);
    assert.ok(dissonanceReport.triggerReason.includes('Cognitive conscience dissonance threshold exceeded'));
  });

  await runTest('4.3 evaluateApoptosis generates structured autopsy with prompt patch guidance', async () => {
    const autopsy = await evaluateApoptosis('agent_autopsy_test', { consecutiveFailures: 5 }, null, { maxConsecutiveFailures: 3 });
    assert.ok(autopsy.reportId.startsWith('autopsy_agent_autopsy_test'));
    assert.strictEqual(autopsy.agentId, 'agent_autopsy_test');
    assert.ok(Array.isArray(autopsy.terminalCallStack));
    assert.ok(typeof autopsy.recommendedPromptPatch === 'string');
    assert.strictEqual(autopsy.metricsSnapshot.consecutiveFailures, 5);
  });
}

async function testCircuitBreakerAndEmergencyHalt() {
  console.log('\n--- Challenge 5: Circuit Breaker & Military Emergency Halt ---');
  console.log('  Competitor Failure: Cascading failures and inability to perform instant emergency stop.');

  const scope = 'chaos_breaker_scope';

  await runTest('5.1 3 consecutive failures trip circuit breaker from CLOSED to OPEN', () => {
    assert.strictEqual(circuitBreaker.checkState(scope), 'CLOSED');
    circuitBreaker.recordFailure('mcp_api', 'Timeout', scope);
    circuitBreaker.recordFailure('mcp_api', '503 Service Unavailable', scope);
    circuitBreaker.recordFailure('mcp_api', 'Connection Refused', scope);

    assert.strictEqual(circuitBreaker.checkState(scope), 'OPEN');
  });

  await runTest('5.2 Circuit breaker in OPEN state quarantines destructive tools', () => {
    const execCheck = circuitBreaker.canExecute('genos_run', 'admin', scope);
    assert.strictEqual(execCheck.allowed, false);
    assert.strictEqual(execCheck.reason, 'CIRCUIT_OPEN');
  });

  await runTest('5.3 Military emergency kill switch freezes and resumes tool executions', () => {
    const haltInfo = circuitBreaker.triggerHalt('Chaos test injection', 'chaos_engineer');
    assert.strictEqual(haltInfo.status, 'halted');
    assert.strictEqual(circuitBreaker.isHalted, true);

    const blockedExec = circuitBreaker.canExecute('any_safe_tool', 'admin');
    assert.strictEqual(blockedExec.allowed, false);

    const resumeInfo = circuitBreaker.resetHalt('chaos_engineer');
    assert.strictEqual(resumeInfo.status, 'resumed');
    assert.strictEqual(circuitBreaker.isHalted, false);
  });
}

async function testCryptobiosisStateRestoration() {
  console.log('\n--- Challenge 6: Cryptobiosis State Restoration under Shock ---');
  console.log('  Competitor Failure: Severe crashes cause memory loss or unrecoverable dirty state.');

  let snapshotId = null;
  const originalState = {
    fleetVersion: '3.0.4',
    workers: [{ id: 'worker_01', role: 'architect', status: 'active' }],
    activeCapsule: 'capsule_hash_999'
  };

  await runTest('6.1 freezeCryptobiosis captures immutable state snapshot with unique identifier', () => {
    const snapshot = freezeCryptobiosis('test_workspace', 'Simulated Infrastructure Power Loss', originalState);
    assert.ok(snapshot.snapshotId.startsWith('cryptobiosis_'));
    assert.strictEqual(snapshot.workspaceId, 'test_workspace');
    assert.strictEqual(snapshot.state.fleetVersion, '3.0.4');
    snapshotId = snapshot.snapshotId;
  });

  await runTest('6.2 thawCryptobiosis rehydrates state cleanly with 100% data integrity', () => {
    const thawed = thawCryptobiosis(snapshotId);
    assert.strictEqual(thawed.success, true);
    assert.strictEqual(thawed.snapshotId, snapshotId);
    assert.deepStrictEqual(thawed.state, originalState);
  });

  await runTest('6.3 thawCryptobiosis reports structured error on missing or invalid snapshot', () => {
    const invalidResult = thawCryptobiosis('non_existent_snapshot_id_404');
    assert.strictEqual(invalidResult.success, false);
    assert.strictEqual(invalidResult.code, 'SNAPSHOT_NOT_FOUND');
    assert.ok(invalidResult.error.includes('is not found'));
  });
}

async function runAll() {
  console.log('======================================================================');
  console.log('   GenOS Chaos Engineering & System Resilience Benchmark Suite');
  console.log('======================================================================');

  await testFailureClassificationAndRemediation();
  await testToxicLoopAndRecoveryCycleDetection();
  await testSomaticHypermutation();
  await testAdaptiveApoptosisAndAutopsy();
  await testCircuitBreakerAndEmergencyHalt();
  await testCryptobiosisStateRestoration();

  console.log('\n======================================================================');
  console.log(`TOTAL CHAOS & RESILIENCE BENCHMARK TESTS: ${passed + failed}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAll();
