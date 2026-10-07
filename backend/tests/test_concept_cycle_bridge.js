'use strict';

const assert = require('node:assert/strict');
const bridge = require('../src/services/agentConceptCycleBridgeService');
const agow = require('../src/services/agow/agowRuntimeIngressService');
const predictive = require('../src/services/runtimePredictiveBridgeService');
const concepts = require('../src/services/conceptRuntimeService');
const feedback = require('../src/services/orchestratorRuntimeFeedback');

async function main() {
  const saved = [agow.process, predictive.process, concepts.processEvent, feedback.process];
  const calls = [];
  const event = { eventType: 'FIXTURE', id: 'event' };
  const ctx = { db: {}, agentId: 'a', handleOrchestrationDecision: async (_ctx, received, type) => {
    assert.equal(received, event); assert.equal(type, event.eventType); calls.push('decision');
  } };
  try {
    agow.process = async () => { calls.push('agow'); return { cycle: { modeResult: { executed: true,
      outcomeReceipt: { calibrated: true, predictionError: 0.1 } } } }; };
    predictive.process = async () => { calls.push('predictive'); return { predictionErrors: [0.1] }; };
    concepts.processEvent = async (_db, input) => {
      calls.push('concepts');
      const statuses = concepts.statuses(input.observation, input.agentId);
      assert.equal(statuses.flexible_agency, 'observed');
      assert.equal(statuses.metacognition, 'observed');
      assert.equal(statuses.predictive_inference, 'observed');
      assert.equal(statuses.causal_integration, 'not_run');
      return { status: 'observed' };
    };
    feedback.process = async () => { calls.push('feedback'); };
    await bridge.observeCycle(ctx, { event, finalEvent: false,
      routeHierarchyEvent: async () => { calls.push('hierarchy'); return null; } });
    await bridge.advanceFeedback(ctx, event);
    assert.deepEqual(calls, ['hierarchy', 'agow', 'predictive', 'concepts', 'feedback', 'decision']);
    const blocked = concepts.statuses({ agow: { cycle: { modeResult: { status: 'executed', executed: false } } } });
    assert.equal(blocked.flexible_agency, 'not_run');
    assert.equal(blocked.metacognition, 'not_run');
    console.log('Cycle producers execute once, actual receipt fields and existing runtime callbacks preserved.');
  } finally {
    [agow.process, predictive.process, concepts.processEvent, feedback.process] = saved;
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
