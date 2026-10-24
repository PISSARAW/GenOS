'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runScenario, REGISTERED_ARMS, EXECUTABLE_ARMS } = require('./run-v2-04.cjs');
const { validateReport } = require('./validate-report.cjs');

async function checkArm(arm, directory) {
  const result = await runScenario({ seed: 'socialworld-v2-04-01', arm, attempt: 1,
    outputDirectory: directory, sourceCommit: 'targeted-test' });
  assert.equal(result.report.status, 'inconclusive');
  assert.equal(result.report.oracle.recalculable, false);
  assert.equal(result.report.observed.runnerExecuted, false);
  assert.equal(result.report.observed.authenticatedReceiptCount, 0);
  assert.match(result.report.oracle.reason, /externally pinned|No V2-04 runtime adapter/);
  assert.deepEqual(validateReport(result.report, path.join(directory, `${arm}-report.json`),
    path.resolve(__dirname, '../../../..')), []);
  const evidencePath = path.join(directory, result.report.evidenceRefs[0]);
  assert.ok(fs.existsSync(evidencePath));
  assert.deepEqual(JSON.parse(fs.readFileSync(evidencePath, 'utf8')), result.evidence);
  return result.report.inputs.comparison;
}

async function run() {
  const manifest = require('./manifest.json');
  const root = path.resolve(__dirname, '../../../..');
  const directory = fs.mkdtempSync(path.join(root, '.tmp-v204-runner-'));
  try {
    assert.deepEqual(REGISTERED_ARMS, manifest.comparisonArms['V2-04']);
    assert.deepEqual(EXECUTABLE_ARMS, []);
    let sharedHashes;
    for (const arm of REGISTERED_ARMS) {
      const hashes = await checkArm(arm, directory);
      if (sharedHashes) assert.deepEqual(hashes, sharedHashes);
      sharedHashes = hashes;
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

run().then(() => process.stdout.write('V2-04 runner remains inconclusive without external verifier receipts\n'))
  .catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
