'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { verifierFor } = require('./prepare_ontogenesis_g1.cjs');
const { isSupportedCaseId } = require('./fixtures/ontogenesis-g1/oracles/rust/verify.cjs');

function main() {
  const verifier = verifierFor({ id: 'rs' }, { oracle: 'average-empty' }, path.resolve('oracle'));
  assert.strictEqual(verifier.args[1], 'rs-average-empty');
  assert.strictEqual(isSupportedCaseId(verifier.args[1]), true);
  assert.strictEqual(isSupportedCaseId('average-empty'), false);
}

main();
