const assert = require('node:assert/strict');
const junction = require('../src/services/gapJunctionService');

const channel = junction.createJunction('a', 'b');
const update = junction.exchange(channel, 'a', { progress: 0.5 });
assert.equal(update.target, 'b');
assert.equal(channel.state.progress, 0.5);
assert.throws(() => junction.exchange(channel, 'c', {}));
console.log('Gap junction checks passed.');
