const assert = require('node:assert/strict');
const adapter = require('../src/services/strategyExecutionAdapter');
const registry = require('../src/strategies/strategyRegistry');

(async () => {
  const beliefs = await adapter.executePrimitive('belief_update', {
    hypotheses: [{ id: 'h1', confidence: 0.5 }],
    evidence: [{ hypothesisId: 'h1', confirms: true }]
  });
  assert.equal(beliefs.best.posterior, 0.65);
  const probes = await adapter.executePrimitive('next_probe', {
    probes: [{ id: 'low', outcomes: [{ probability: 1 }] }, { id: 'high', outcomes: [{ probability: 0.5 }, { probability: 0.5 }] }]
  });
  assert.equal(probes.selectedProbe.id, 'high');
  const trajectory = await adapter.executePrimitive('analyze_trajectory', { actionHistory: ['a', 'a', 'b', 'b'] });
  assert.equal(trajectory.loopDetected, true);
  assert.equal(registry.getStrategy('bayesian_sequential_diagnosis').missingPrimitives.length, 0);
  assert.equal(registry.getStrategy('loop_detection_lkgs').missingPrimitives.length, 0);
  console.log('Strategy Bayesian primitive checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });