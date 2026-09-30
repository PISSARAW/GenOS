'use strict';

const assert = require('node:assert/strict');
const { runAblationExperiment } = require('./nceAblationTests');

async function main() {
  const config = { domain: 'optimization' };
  const first = await runAblationExperiment(config, 3);
  const replay = await runAblationExperiment(config, 3);
  assert.equal(first.evidenceClass, 'simulation-prototype');
  assert.equal(first.scientificValidity, false);
  assert.ok(first.limitations.includes('no real task benchmark'));
  assert.deepEqual(first.results, replay.results, 'prototype run is repeatable for debugging');
  console.log('NCE ablation prototype status and repeatability: PASS');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
