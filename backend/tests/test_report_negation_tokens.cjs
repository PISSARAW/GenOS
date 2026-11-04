'use strict';
const assert = require('node:assert/strict');
const {nliVerdict} = require('../src/services/reportCompilerService');
assert.notEqual(nliVerdict('Executed node smoke.test.cjs and node invariants.test.cjs successfully.',
  ['genos://code-file/abc', 'genos://code-test/def']), 'contradiction');
assert.equal(nliVerdict('The command never failed.', ['The command failed.']), 'contradiction');
assert.equal(nliVerdict('Le test ne réussit.', ['Le test réussit.']), 'contradiction');
assert.equal(nliVerdict('Executed 3 tests.', ['Executed 2 tests.']), 'contradiction');
console.log('Report gate: node and genos are not negations; actual negations and numerical contradictions remain checked PASS');
