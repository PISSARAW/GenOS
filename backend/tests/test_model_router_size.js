const assert = require('node:assert/strict');
const { parseSize } = require('../src/services/modelRouter');

assert.equal(parseSize('model:7b'), 7e9);
assert.equal(parseSize('custom-model'), null);
console.log('Unknown model sizes are not misclassified as 7B.');