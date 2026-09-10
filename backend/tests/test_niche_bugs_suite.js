const assert = require('node:assert/strict');
const path = require('path');
const circuitBreaker = require('../src/services/circuitBreaker');
const { calculateShannonEntropy, detectDeadlocks } = require('../src/services/swarmMetricsService');
const { penalizeBudget, cycleDetection } = require('../src/services/primitiveHandlers/detection/cycleDetection');
const { enforceReproductionLimits } = require('../src/services/primitiveHandlers/fundamentals');
const runtimeAdapter = require('../src/services/agentRuntimeAdapter');

async function testCircuitBreakerGlobalHalfOpenSync() {
  console.log('Testing Circuit Breaker HALF-OPEN global synchronization...');
  circuitBreaker.resetHalt();
  circuitBreaker.state = 'HALF-OPEN';
  circuitBreaker.halfOpenProbe = null;

  // A scoped caller executes a destructive canary tool
  const canExec = circuitBreaker.canExecute('genos_run', 'admin', 'agent-canary-test');
  assert.equal(canExec.allowed, true);
  assert.equal(circuitBreaker.halfOpenProbe, 'genos_run', 'Global halfOpenProbe should be set');

  // A concurrent execution should be blocked because canary is in progress
  const canExecConcurrent = circuitBreaker.canExecute('genos_run', 'admin', 'agent-other');
  assert.equal(canExecConcurrent.allowed, false);
  assert.equal(canExecConcurrent.reason, 'CANARY_IN_PROGRESS');

  // Canary succeeds in scoped context
  circuitBreaker.recordSuccess('genos_run', 'agent-canary-test');
  assert.equal(circuitBreaker.state, 'CLOSED', 'Global breaker must reset to CLOSED');
  assert.equal(circuitBreaker.halfOpenProbe, null, 'Global probe must be cleared');

  // Loop exemption without genos_ prefix
  for (let i = 0; i < 10; i++) {
    const res = circuitBreaker.canExecute('report_progress', 'viewer', 'agent-exempt-test', { phase: 'testing', message: 'ok' });
    assert.equal(res.allowed, true, 'report_progress must be loop-exempt');
  }
  console.log('  PASS: Circuit breaker canary sync and prefix-agnostic loop exemptions work.');
}

function testSwarmMetricsEmptyAndNullSafety() {
  console.log('Testing Swarm Metrics empty & null safety...');
  const emptyRes = calculateShannonEntropy([]);
  assert.equal(emptyRes.rawEntropy, 0);
  assert.equal(emptyRes.cognitiveDriftState, 'IDLE');
  assert.equal(typeof emptyRes.diagnosticRecommendation, 'string');
  assert.equal(emptyRes.uniqueActionCount, 0);
  assert.ok(Array.isArray(emptyRes.sparkline));

  assert.doesNotThrow(() => detectDeadlocks(null));
  assert.doesNotThrow(() => detectDeadlocks([null, { sender: 'a' }]));
  console.log('  PASS: Swarm metrics empty actions and invalid queues are handled cleanly.');
}

async function testCycleDetectionMultiParticipantBudget() {
  console.log('Testing cycle detection budget penalty across participants...');
  const updated = [];
  const fakeDb = {
    async run(sql, id) {
      updated.push(id);
      return { changes: 1 };
    }
  };

  const penalty = await penalizeBudget(fakeDb, null, ['agent-1', 'agent-2']);
  assert.equal(penalty, 30, 'Should penalize 15 per participant (total 30)');
  assert.deepEqual(updated, ['agent-1', 'agent-2']);
  console.log('  PASS: Cycle detection penalizes each cycle participant when target is null.');
}

async function testHayflickSnakeCase() {
  console.log('Testing Hayflick snake_case parameter support...');
  const fakeDb = {
    async get(sql) {
      if (sql.includes('COUNT(*)')) return { count: 3 };
      return null;
    }
  };

  // Passing hayflick_limit: 2 should block since count is 3
  const check = await enforceReproductionLimits(fakeDb, 'parent-1', { hayflick_limit: 2 });
  assert.equal(check.allowed, false, 'Should be blocked by hayflick_limit');
  assert.equal(check.maxBuds, 2);
  console.log('  PASS: hayflick_limit snake_case parameter is properly honored.');
}

async function runAll() {
  await testCircuitBreakerGlobalHalfOpenSync();
  testSwarmMetricsEmptyAndNullSafety();
  await testCycleDetectionMultiParticipantBudget();
  await testHayflickSnakeCase();
  console.log('\nALL NICHE BUG VERIFICATION CHECKS PASSED!');
}

runAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
