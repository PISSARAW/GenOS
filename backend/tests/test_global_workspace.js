'use strict';
const assert = require('assert');
const { compete, diffuse, consume, causalEffect } = require('../src/services/globalWorkspaceService');
const state = compete([{ id: 'a', salience: 2 }, { id: 'b', salience: 0.4 }], { capacity: 1, ignitionThreshold: 1, modules: ['memory', 'planning', 'reporting'] });
assert.strictEqual(state.ignited, true);
assert.strictEqual(state.evicted.length, 1);
assert.strictEqual(diffuse(state, ['memory'])[0].contentId, 'a');
for (const module of ['memory', 'planning', 'reporting']) {
  assert.strictEqual(consume(state, module, (contentId) => contentId).output, 'a');
  assert.strictEqual(causalEffect(state, module, (contentId) => contentId || 'fallback').changed, true);
}
assert.strictEqual(consume(state, 'unauthorized', (contentId) => contentId).available, false);
assert.strictEqual(causalEffect({ ...state, winner: null }, 'memory', (value) => value).measured, false);
console.log('✅ global workspace tests passed');
