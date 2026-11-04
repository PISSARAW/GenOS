'use strict';
const assert = require('node:assert/strict');
const {nliVerdict} = require('../src/services/reportCompilerService');
assert.notEqual(nliVerdict('Executed node smoke.test.cjs and node invariants.test.cjs successfully.',
  ['genos://code-file/abc', 'genos://code-test/def']), 'contradiction');
assert.equal(nliVerdict('The command never failed.', ['The command failed.']), 'contradiction');
assert.equal(nliVerdict('Le test ne réussit.', ['Le test réussit.']), 'contradiction');
assert.equal(nliVerdict('Le test ne passe pas.', ['log: tous les tests passent']), 'contradiction');
assert.equal(nliVerdict('Le test ne réussit jamais.', ['Le test réussit.']), 'contradiction');
assert.equal(nliVerdict("Le test n'est pas validé.", ['Le test est validé.']), 'contradiction');
assert.notEqual(nliVerdict('Le test ne passe pas.', ['Le test ne passe pas.']), 'contradiction');
assert.equal(nliVerdict('Executed 3 tests.', ['Executed 2 tests.']), 'contradiction');
console.log('Report gate: node and genos are not negations; actual negations and numerical contradictions remain checked PASS');
