'use strict';

const assert = require('node:assert/strict');
const { accumulate, changes } = require('../src/services/axolotlRegenerationCostService');

const observed = accumulate(null, { tokens: 20, events: 2, costUsd: 0.1, confidence: 1, durationMs: -5 });
assert.deepEqual(observed, { source: 'runtime_observation', tokens: 20, events: 2, costUsd: 0.1 });
assert.deepEqual(accumulate(observed, { tokens: 5 }), { ...observed, tokens: 25 });
assert.deepEqual(changes({ components: [{ id: 'a', role: 'worker' }], connections: [] }, {
  components: [{ id: 'b', role: 'worker' }], connections: [{ from: 'b', to: 'b', type: 'feedback' }]
}), { componentsChanged: 2, connectionsChanged: 1 });
