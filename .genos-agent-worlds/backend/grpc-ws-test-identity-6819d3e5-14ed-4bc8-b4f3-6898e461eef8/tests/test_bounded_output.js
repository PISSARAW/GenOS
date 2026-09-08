const assert = require('assert');
const { appendBounded } = require('../src/services/boundedOutput');

const output = appendBounded('', '😀'.repeat(300000), 256000);

assert.ok(Buffer.byteLength(output, 'utf8') <= 256000);
assert.ok(output.length > 0);
console.log('Bounded output byte limit passed.');