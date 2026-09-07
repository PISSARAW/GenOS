const assert = require('node:assert/strict');
const circuitBreaker = require('../src/services/circuitBreaker');

function reset() {
  circuitBreaker.resetHalt('test');
  circuitBreaker.toolLockOverrides.clear();
}

function testSuccessResetsFailures() {
  reset();
  circuitBreaker.recordFailure('tool', 'one');
  circuitBreaker.recordFailure('tool', 'two');
  circuitBreaker.recordSuccess('tool');
  circuitBreaker.recordFailure('tool', 'three');
  assert.equal(circuitBreaker.getStatus().state, 'CLOSED');
  assert.equal(circuitBreaker.getStatus().failureCount, 1);
}

function testScopedResetAndStatus() {
  reset();
  circuitBreaker.trip('worker-a', 'test');
  assert.equal(circuitBreaker.getStatus().scopes['worker-a'].state, 'OPEN');
  circuitBreaker.resetHalt('test');
  assert.equal(circuitBreaker.getStatus('worker-a').state, 'CLOSED');
}

function testHalfOpenProbeIsExclusive() {
  reset();
  circuitBreaker.trip('probe', 'test');
  const scoped = circuitBreaker.context('probe');
  scoped.lastStateChange = Date.now() - circuitBreaker.cooldownMs - 1;
  assert.equal(circuitBreaker.checkState('probe'), 'HALF-OPEN');
  assert.equal(circuitBreaker.canExecute('genos_merge', 'admin', 'probe').allowed, true);
  assert.equal(circuitBreaker.canExecute('genos_merge', 'admin', 'probe').reason, 'CANARY_IN_PROGRESS');
}

function testCircularArgumentsDoNotThrow() {
  reset();
  const args = {};
  args.self = args;
  assert.equal(circuitBreaker.canExecute('genos_inspect', 'viewer', 'circular', args).allowed, true);
}

testSuccessResetsFailures();
testScopedResetAndStatus();
testHalfOpenProbeIsExclusive();
testCircularArgumentsDoNotThrow();
console.log('Circuit breaker checks passed.');