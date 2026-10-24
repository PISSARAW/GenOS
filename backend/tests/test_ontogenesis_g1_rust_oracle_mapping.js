'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { verifierFor } = require('./prepare_ontogenesis_g1.cjs');
const { featureForCaseId, isSupportedCaseId } = require('./fixtures/ontogenesis-g1/oracles/rust/verify.cjs');

function main() {
  const previous = process.env.GENOS_ONTOGENESIS_G1_VERIFIER_IMAGE;
  process.env.GENOS_ONTOGENESIS_G1_VERIFIER_IMAGE = `registry.example.invalid/genos/ontogenesis-verifier@sha256:${'a'.repeat(64)}`;
  const verifier = verifierFor({ id: 'rs' }, { oracle: 'average-empty' }, path.resolve('oracle'));
  if (previous === undefined) delete process.env.GENOS_ONTOGENESIS_G1_VERIFIER_IMAGE;
  else process.env.GENOS_ONTOGENESIS_G1_VERIFIER_IMAGE = previous;
  assert.strictEqual(verifier.args[1], 'rs-average-empty');
  assert.strictEqual(verifier.sandbox.runtime, 'docker');
  assert.strictEqual(verifier.sandbox.image.endsWith('a'.repeat(64)), true);
  assert.strictEqual(isSupportedCaseId(verifier.args[1]), true);
  assert.strictEqual(featureForCaseId(verifier.args[1]), 'case_average_empty');
  assert.strictEqual(featureForCaseId('rs-median'), 'case_median');
  assert.strictEqual(isSupportedCaseId('average-empty'), false);
}

main();
