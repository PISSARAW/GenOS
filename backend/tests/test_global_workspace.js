'use strict';
const assert = require('assert');
const { compete, diffuse } = require('../src/services/globalWorkspaceService');
const state = compete([{ id: 'a', salience: 2 }, { id: 'b', salience: 0.4 }], { capacity: 1, ignitionThreshold: 1, modules: ['memory'] });
assert.strictEqual(state.ignited, true);
assert.strictEqual(state.evicted.length, 1);
assert.strictEqual(diffuse(state, ['memory'])[0].contentId, 'a');
console.log('✅ global workspace tests passed');
