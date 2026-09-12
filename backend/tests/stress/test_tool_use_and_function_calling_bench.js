/**
 * GenOS Tool Use & Function Calling Benchmark Suite
 * High-complexity tool execution, lease policy, circuit breaker, and schema validation challenges:
 * 1. Schema & Strict Argument Validation (Rejection of Malformed / Injected Payloads)
 * 2. Fail-Closed Tool Lease Policy & Least-Privilege Confinement
 * 3. Runaway Loop Detection & Circuit Breaker Auto-Tripping
 * 4. Deterministic Multi-Tool Pipeline & Execution Kind Dispatch
 * 5. Idempotent Invocations & Destructive Tool Locking
 * 6. Degraded Tool Embargo & Non-Leaking Error Isolation
 */

const assert = require('assert');
const { validateToolArguments } = require('../../src/services/mcpArgumentValidation');
const toolLease = require('../../src/services/toolLeasePolicy');
const circuitBreaker = require('../../src/services/circuitBreaker');
const mcpRegistry = require('../../src/services/mcpToolRegistry');
const mcpStrategy = require('../../src/services/mcpStrategyTools');

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

async function testSchemaArgumentValidation() {
  console.log('\n--- Challenge 1: Schema & Strict Argument Validation ---');
  console.log('  Competitor Failure: Raw JSON passed unvetted, causing crashes or type injections.');

  await runTest('1.1 Reject non-object or array arguments payload', () => {
    const errArray = validateToolArguments('genos_snapshot', ['invalid', 'array']);
    const errString = validateToolArguments('genos_snapshot', 'string_payload');
    assert.ok(errArray && errArray.code === 'INVALID_TOOL_ARGUMENTS');
    assert.ok(errString && errString.code === 'INVALID_TOOL_ARGUMENTS');
  });

  await runTest('1.2 Reject missing required fields for tool with strict schema', () => {
    const errMissing = validateToolArguments('genos_snapshot', { agent: 'worker-1' });
    assert.ok(errMissing);
    assert.strictEqual(errMissing.code, 'INVALID_TOOL_ARGUMENTS');
    assert.ok(errMissing.message.includes('out: is required'));
  });

  await runTest('1.3 Reject oversized argument exceeding 64KB length bound', () => {
    const oversizedString = 'x'.repeat(65 * 1024);
    const errOversized = validateToolArguments('genos_snapshot', { agent: 'worker-1', out: oversizedString });
    assert.ok(errOversized);
    assert.ok(errOversized.message.includes('at most 65536 characters'));
  });

  await runTest('1.4 Pass validated arguments conforming to contract', () => {
    const valid = validateToolArguments('genos_snapshot', { agent: 'worker-1', out: 'valid_path.json' });
    assert.strictEqual(valid, null);
  });
}

async function testFailClosedToolLeasePolicy() {
  console.log('\n--- Challenge 2: Fail-Closed Tool Lease Policy ---');
  console.log('  Competitor Failure: Sub-agents acquire unauthorized tools or self-elevate.');

  await runTest('2.1 Worker base lease strictly excludes orchestrator core tools', () => {
    const workerLease = toolLease.workerLeaseForRole('implementation');
    assert.strictEqual(workerLease.includes('genos_create'), false);
    assert.strictEqual(workerLease.includes('genos_solve'), false);
    assert.strictEqual(workerLease.includes('genos_orchestrate'), false);
  });

  await runTest('2.2 Provided lease can only restrict policy, never widen it', () => {
    const policy = toolLease.workerLeaseForRole('implementation');
    const attemptedWiden = [...policy, 'genos_trinity_launch', 'genos_delegate_worker'];
    const restricted = toolLease.restrictProvidedLease(attemptedWiden, policy);

    assert.strictEqual(restricted.includes('genos_trinity_launch'), false);
    assert.strictEqual(restricted.includes('genos_delegate_worker'), false);
    assert.strictEqual(toolLease.isLeaseSubsetOf(restricted, policy), true);
  });

  await runTest('2.3 Strip genos_orchestrate and phonetic variants unconditionally', () => {
    const variants = ['genos_orchestrate', 'GENOS_ORCHESTRATE', 'genosorchestrate', 'GenOS_Orchestrate'];
    for (const v of variants) {
      assert.strictEqual(toolLease.isOrchestrateVariant(v), true);
    }
    const sanitized = toolLease.restrictProvidedLease(variants, ['genos_run']);
    assert.strictEqual(sanitized.length, 0);
  });

  await runTest('2.4 Stale lease detector identifies unearned tools after role downgrade', () => {
    const privilegedTools = ['genos_adversarial_review', 'genos_run'];
    const agent = { execution_mode: 'worker', role: 'implementation', plan: null };
    const stale = toolLease.staleLeaseTools(agent, privilegedTools);
    assert.ok(stale.includes('genos_adversarial_review'), 'Review tool must be stale for standard worker');
  });
}

async function testCircuitBreakerAndRunawayProtection() {
  console.log('\n--- Challenge 3: Runaway Loop Detection & Circuit Breaker ---');
  console.log('  Competitor Failure: Agents enter infinite tool-call loops exhausting budget.');

  const scope = `agent_runaway_${Date.now()}`;

  await runTest('3.1 Detect consecutive identical calls exceeding runaway threshold (6 calls)', () => {
    const tool = 'genos_diagnose';
    const args = { issue: 'memory_spike' };

    for (let i = 0; i < 5; i += 1) {
      const check = circuitBreaker.canExecute(tool, 'operator', scope, args);
      assert.strictEqual(check.allowed, true);
    }
    const sixthCheck = circuitBreaker.canExecute(tool, 'operator', scope, args);
    assert.strictEqual(sixthCheck.allowed, false);
    assert.strictEqual(sixthCheck.reason, 'TOOL_EXECUTION_LOOP');
  });

  await runTest('3.2 Consecutive failures trip circuit breaker to OPEN state for destructive tools', () => {
    const failScope = `agent_fail_${Date.now()}`;
    const ctx = circuitBreaker.context(failScope);

    for (let i = 0; i < 3; i += 1) {
      circuitBreaker.recordFailure('genos_restore', 'Upstream error', failScope);
    }
    assert.strictEqual(ctx.state, 'OPEN');
    const blockedCheck = circuitBreaker.canExecute('genos_restore', 'admin', failScope, {});
    assert.strictEqual(blockedCheck.allowed, false);
    assert.strictEqual(blockedCheck.reason, 'CIRCUIT_OPEN');
  });

  await runTest('3.3 Half-open probe allows single test after cooldown window', () => {
    const probeScope = `agent_probe_${Date.now()}`;
    const ctx = circuitBreaker.context(probeScope);
    ctx.state = 'OPEN';
    ctx.lastStateChange = Date.now() - 70000; // Passed 60s cooldown

    const check1 = circuitBreaker.canExecute('genos_restore', 'admin', probeScope, {});
    assert.strictEqual(check1.allowed, true);
    assert.strictEqual(ctx.state, 'HALF-OPEN');

    // Second execution in half-open is blocked until canary probe completes
    const check2 = circuitBreaker.canExecute('genos_restore', 'admin', probeScope, {});
    assert.strictEqual(check2.allowed, false);
    assert.strictEqual(check2.reason, 'CANARY_IN_PROGRESS');
  });
}

async function testDeterministicMultiToolPipeline() {
  console.log('\n--- Challenge 4: Deterministic Multi-Tool Pipeline Execution ---');
  console.log('  Competitor Failure: Lost intermediate state and unhandled dispatch failures.');

  await runTest('4.1 Dispatch recognized strategy tool directly with argument validation', async () => {
    const res = await mcpStrategy.executeStrategyTool('genos_lineage', { target_id: 'decision_449' });
    assert.ok(res);
    assert.strictEqual(res.configured, true);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.output.targetId, 'decision_449');
  });

  await runTest('4.2 Dynamic tool execution kind classifier categorizes tools accurately', () => {
    assert.strictEqual(mcpRegistry.detectExecutionKind('genos_lineage'), 'strategy');
    assert.strictEqual(mcpRegistry.detectExecutionKind('genos_cell_division'), 'bio');
    assert.strictEqual(mcpRegistry.detectExecutionKind('non_existent_tool_99'), 'unsupported');
  });

  await runTest('4.3 Dispatching invalid arguments fails fast before tool execution', async () => {
    const res = await mcpRegistry.dispatchTool('genos_snapshot', {});
    assert.strictEqual(res.result.success, false);
    assert.strictEqual(res.result.status, 'invalid_args');
  });
}

async function testIdempotencyAndDestructiveLocking() {
  console.log('\n--- Challenge 5: Idempotent Invocations & Destructive Locking ---');
  console.log('  Competitor Failure: Retrying calls duplicates side-effects and destructive actions.');

  await runTest('5.1 Deterministic argument signature generation matches identical payloads', () => {
    const sig1 = circuitBreaker.argumentSignature({ a: 1, b: 'xyz' });
    const sig2 = circuitBreaker.argumentSignature({ a: 1, b: 'xyz' });
    const sig3 = circuitBreaker.argumentSignature({ a: 2, b: 'xyz' });
    assert.strictEqual(sig1, sig2);
    assert.notStrictEqual(sig1, sig3);
  });

  await runTest('5.2 Identify destructive tools requiring higher security checks', () => {
    assert.strictEqual(circuitBreaker.isDestructive('genos_resilience_apoptosis'), true);
    assert.strictEqual(circuitBreaker.isDestructive('genos_restore'), true);
    assert.strictEqual(circuitBreaker.isDestructive('genos_diagnose'), false);
    assert.strictEqual(circuitBreaker.isDestructive('genos_lineage'), false);
  });
}

async function testDegradedToolEmbargo() {
  console.log('\n--- Challenge 6: Degraded Tool Embargo & Safe Error Isolation ---');
  console.log('  Competitor Failure: Broken or embargoed tools leak internal stacktraces.');

  await runTest('6.1 toolLockOverrides embargoes specific tool regardless of role', () => {
    circuitBreaker.toolLockOverrides.set('genos_run', true);
    const check = circuitBreaker.canExecute('genos_run', 'admin', 'global', {});
    assert.strictEqual(check.allowed, false);
    assert.strictEqual(check.reason, 'TOOL_LOCKED');
    circuitBreaker.toolLockOverrides.delete('genos_run');
  });

  await runTest('6.2 Dispatching unsupported tool returns sanitized error with no leak', async () => {
    const res = await mcpRegistry.dispatchTool('unsupported_exotic_tool', {});
    assert.strictEqual(res.kind, 'unsupported');
    assert.strictEqual(res.result.success, false);
    assert.strictEqual(res.result.status, 'unsupported');
    assert.strictEqual(res.result.error, "Tool 'unsupported_exotic_tool' is not registered.");
  });
}

async function main() {
  console.log('======================================================================');
  console.log('   GenOS Tool Use & Function Calling Benchmark Suite');
  console.log('======================================================================');

  await testSchemaArgumentValidation();
  await testFailClosedToolLeasePolicy();
  await testCircuitBreakerAndRunawayProtection();
  await testDeterministicMultiToolPipeline();
  await testIdempotencyAndDestructiveLocking();
  await testDegradedToolEmbargo();

  console.log('\n======================================================================');
  console.log(`TOTAL TOOL CALLING BENCHMARK TESTS: ${passed + failed}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal benchmark error:', err);
  process.exit(1);
});
