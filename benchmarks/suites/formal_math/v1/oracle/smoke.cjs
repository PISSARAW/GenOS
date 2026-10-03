'use strict';

const assert = require('node:assert/strict');
const { loadItems, leanIdentity, checkProof } = require('./check.cjs');

async function main() {
  const { corpus } = loadItems();
  const lean = leanIdentity(process.env.GENOS_LEAN_EXECUTABLE || 'lean');
  assert.equal(lean.version, corpus.toolchain);
  const good = await checkProof(corpus.items[0], '  simp', lean);
  const bad = await checkProof(corpus.items[0], '  sorry', lean);
  assert.equal(good.passed, true, JSON.stringify(good));
  assert.equal(bad.passed, false);
  console.log(JSON.stringify({ leanVersion: lean.raw, good, bad }, null, 2));
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
