'use strict';
const assert = require('node:assert/strict');
const { collect } = require('./collector.cjs');
const { source } = require('./source.cjs');
assert.deepEqual(collect(source([[1], [2]])), [1, 2]);
assert.doesNotThrow(() => collect(source([[1], [2]], [1])));
