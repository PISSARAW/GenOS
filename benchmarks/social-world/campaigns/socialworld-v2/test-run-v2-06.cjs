'use strict';

const assert = require('node:assert/strict');
const manifest = require('./manifest.json');
const { REGISTERED_ARMS, EXECUTABLE_ARMS, runScenario } = require('./run-v2-06.cjs');

async function run() {
  assert.deepEqual(REGISTERED_ARMS, manifest.comparisonArms['V2-06']);
  assert.deepEqual(EXECUTABLE_ARMS, []);
  for (const arm of REGISTERED_ARMS) {
    const result = await runScenario({ seed: manifest.seeds[0], arm, attempt: 1, sourceCommit: 'test-commit' });
    assert.equal(result.report.status, 'inconclusive');
    assert.equal(result.report.oracle.recalculable, false);
    assert.deepEqual(result.report.evidenceRefs, []);
    assert.equal(result.evidence.captureAccepted, false);
    assert.match(result.report.oracle.reason, /Missing runtime capture fields/);
  }
}

run().then(() => process.stdout.write('V2-06 registers all manifest arms and refuses synthetic runtime proof\n'))
  .catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
