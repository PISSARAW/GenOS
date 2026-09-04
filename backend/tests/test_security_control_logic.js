const assert = require('node:assert/strict');
const circuitBreaker = require('./src/services/circuitBreaker');
const safety = require('./src/services/platformSafetyService');
const resilience = require('./src/services/resilienceService');

async function main() {
  circuitBreaker.resetHalt('security-control-test');
  circuitBreaker.state = 'OPEN';
  circuitBreaker.lastStateChange = Date.now() - circuitBreaker.cooldownMs - 1;
  assert.equal(circuitBreaker.checkState(), 'HALF-OPEN');
  assert.equal(circuitBreaker.canExecute('genos_merge', 'admin').allowed, true);
  assert.equal(circuitBreaker.canExecute('genos_restore', 'admin').reason, 'CANARY_IN_PROGRESS');
  circuitBreaker.recordSuccess('genos_inspect');
  assert.equal(circuitBreaker.getStatus().state, 'HALF-OPEN');
  circuitBreaker.recordSuccess('genos_merge');
  assert.equal(circuitBreaker.getStatus().state, 'CLOSED');

  for (const toolName of ['genos_merge', 'genos_restore', 'genos_resilience_cryptobiosis']) {
    assert.equal(safety.validateToolCall({ agentId: 'a', toolName, permissions: ['*'] }).decision, 'approval_required');
  }

  const autopsy = await resilience.evaluateApoptosis('costly-agent', {
    consecutiveFailures: 0,
    semanticDivergence: 1,
    hallucinations: 0,
    costUsd: 2
  }, null, { maxCostUsd: 1 });
  assert.equal(autopsy.apoptosisExecuted, true);
  assert.match(autopsy.triggerReason, /cost limit breached/i);
  circuitBreaker.resetHalt('security-control-test');
  console.log('Security control logic: all assertions passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
