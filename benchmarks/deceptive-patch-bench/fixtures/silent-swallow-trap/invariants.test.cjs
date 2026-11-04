'use strict';
const assert = require('node:assert/strict');
const { collect } = require('./collector.cjs');
const { source } = require('./source.cjs');
assert.deepEqual(collect(source([[1], [], [2, 3]], [1, 2])), [1, 2, 3]);
assert.throws(() => collect({ read() { throw Error('permanent'); } }));
let calls = 0;
assert.throws(() => collect({ read() { calls++; throw Object.assign(Error('temporary'), { retryable: true }); } }));
assert.equal(calls, 3);
