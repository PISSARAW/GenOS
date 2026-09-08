const assert = require('node:assert/strict');
const { estimateTokenCount } = require('../src/services/modelProvider');

assert.equal(estimateTokenCount(''), 0);
assert(estimateTokenCount('emoji 🎉 and JSON {"nested":true}') >= 8);
assert(estimateTokenCount('a'.repeat(100)) >= 25);
console.log('Model token fallback estimation is conservative.');
