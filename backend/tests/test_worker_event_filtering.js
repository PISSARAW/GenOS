const assert = require('node:assert/strict');
const swarmMetrics = require('../src/services/swarmMetricsService');
const swarmSentinel = require('../src/services/swarmSentinelService');
const { shouldProcessNaturalSearchEvent } = require('../src/services/search/naturalSearchRuntime');
const { selectStrategyPortfolio } = require('../src/strategies/strategySelector');

function verifyNaturalSearchFiltering() {
  assert.equal(shouldProcessNaturalSearchEvent({ eventType: 'AGENT_RUNTIME_LOG' }), false);
  assert.equal(shouldProcessNaturalSearchEvent({ eventType: 'NATURAL_SEARCH_DECISION' }), false);
  assert.equal(shouldProcessNaturalSearchEvent({ eventType: 'AGENT_STEP', action: 'THINK' }), false);
  assert.equal(shouldProcessNaturalSearchEvent({
    eventType: 'AGENT_STEP', payload: { type: 'item.started' }
  }), false);
  assert.equal(shouldProcessNaturalSearchEvent({
    eventType: 'AGENT_STEP', action: 'command_execution', payload: { type: 'item.completed' }
  }), true);
  assert.equal(shouldProcessNaturalSearchEvent({ eventType: 'EVIDENCE_REPORT' }), true);
}

function verifySentinelFiltering() {
  const agentId = `event-filter-${Date.now()}`;
  for (let index = 0; index < 8; index += 1) {
    const result = swarmSentinel.inspectEvent(agentId, {
      eventType: 'AGENT_RUNTIME_LOG', action: 'STDERR', detail: 'fallback strategy repeated'
    });
    assert.equal(result.intervention, false);
  }
  assert.equal(swarmSentinel.getAgentEntropy(agentId).sampleSize, 0);
  swarmSentinel.clearAgent(agentId);
}

function verifyTransitionEntropyIsNotEnough() {
  const metrics = swarmMetrics.calculateShannonEntropy(['a', 'b', 'c', 'b']);
  assert.equal(metrics.transitionEntropy, 0);
  assert.ok(metrics.normalizedEntropy > 0.9);
  assert.equal(metrics.isPeriodicCycle, false);
  assert.equal(metrics.cognitiveDriftState, 'OPTIMAL_EXPLORATION');
  assert.equal(metrics.reasonCode, null);
}

function verifyRealCycleStillStops() {
  const metrics = swarmMetrics.calculateShannonEntropy(['read', 'edit', 'read', 'edit']);
  assert.equal(metrics.isPeriodicCycle, true);
  assert.equal(metrics.cycleLength, 2);
  assert.equal(metrics.cognitiveDriftState, 'COLLAPSE_DEADLOCK');
  assert.equal(metrics.reasonCode, 'PERIODIC_ACTION_CYCLE');
}

function verifyFallbackIsContractData() {
  const writes = [];
  const originalWrite = process.stderr.write;
  process.stderr.write = chunk => { writes.push(String(chunk)); return true; };
  let selection;
  try {
    selection = selectStrategyPortfolio({
      problem: 'creative writing mission',
      problemProfile: { type: 'creative_writing' },
      inhibitedStrategyIds: ['deterministic_direct_path']
    });
  } finally {
    process.stderr.write = originalWrite;
  }
  assert.equal(writes.length, 0);
  assert.ok(selection.primaryFallback);
  assert.equal(selection.primaryFallback.requested, 'deterministic_direct_path');
  assert.equal(selection.primaryFallback.selected, selection.primary.id);
}

verifyNaturalSearchFiltering();
verifySentinelFiltering();
verifyTransitionEntropyIsNotEnough();
verifyRealCycleStillStops();
verifyFallbackIsContractData();
console.log('Worker event filtering and collapse classification passed.');
