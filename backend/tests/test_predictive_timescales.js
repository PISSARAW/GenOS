'use strict';

const assert = require('assert');
const policy = require('../src/services/predictiveTimescale/timescalePolicy');
const service = require('../src/services/predictiveTimescale/predictiveTimescaleService');

function verifiesConservativePlasticity() {
  const rates = policy.LEVELS.map((level) => level.learningRate);
  const evidence = policy.LEVELS.map((level) => level.minEvidence);
  assert.ok(rates.every((rate, index) => index === 0 || rate < rates[index - 1]));
  assert.ok(evidence.every((count, index) => index === 0 || count > evidence[index - 1]));
  const quick = policy.posterior({ prior: 0, prediction: 1, observation: 1, precision: 1, learningRate: policy.levelOf('T0').learningRate });
  const slow = policy.posterior({ prior: 0, prediction: 1, observation: 1, precision: 1, learningRate: policy.levelOf('T6').learningRate });
  assert.ok(quick.posterior > slow.posterior);
}

function verifiesHierarchyFlow() {
  const state = service.ensureState({ levels: { T3: { values: { latency: { posterior: 0.4 } } } } });
  const update = service.updateLevel(state, { timescale: 'T1', metric: 'latency', prediction: 0.2,
    observation: 0.5, evidenceRefs: ['e1', 'e2'], independentRefs: ['run1', 'run2'], tolerance: 0.01 });
  assert.strictEqual(update.next.priorSource, 'T3');
  assert.ok(update.eligibleForUpwardRoute);
  state.levels.T1.errors.latency = 3;
  const route = service.routeError(state, { timescale: 'T1', metric: 'latency', evidenceRefs: ['e1'] }, update);
  assert.strictEqual(route.to, 'T2');
  const candidate = service.agowCandidate(route, 'agent', 100);
  assert.strictEqual(candidate.content.semanticType, 'cross_scale_prediction_error');
}

verifiesConservativePlasticity();
verifiesHierarchyFlow();
console.log('Predictive timescale checks passed.');
