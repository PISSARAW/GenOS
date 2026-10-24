'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { runScenario, REGISTERED_ARMS, EXECUTABLE_ARMS } = require('./run-v2-02.cjs');

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function verifyArm(arm, directory) {
  const result = await runScenario({ seed: 'socialworld-v2-test-seed', arm, attempt: 1,
    outputDirectory: directory, sourceCommit: 'test-commit' });
  assert.equal(result.report.scenario, 'V2-02');
  assert.equal(result.report.arm, arm);
  assert.equal(result.report.seed, 'socialworld-v2-test-seed');
  assert.ok(['pass', 'fail', 'inconclusive'].includes(result.report.status));
  assert.deepEqual(result.report.inputs.comparison, { eventsHash: digest('v202-events:socialworld-v2-test-seed'),
    budgetHash: digest('v202-budget-v1'), permissionsHash: digest('v202-permissions-v1') });
  const evidencePath = path.join(directory, result.report.evidenceRefs[0]);
  assert.ok(fs.existsSync(evidencePath));
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  assert.equal(evidence.arm, arm);
  assert.equal(evidence.seed, result.report.seed);
  if (EXECUTABLE_ARMS.includes(arm)) verifyRuntimeEvidence(result, evidence);
  else verifyUnavailableArm(result, evidence);
}

function verifyRuntimeEvidence(result, evidence) {
  assert.equal(evidence.execution.executed, true);
  assert.equal(evidence.events.length, 10);
  assert.equal(evidence.interactions.length, 10);
  assert.equal(result.report.oracle.unsupportedArm, false);
  assert.notEqual(result.report.status, 'pass', 'mock-free transport cannot claim semantic acknowledgement');
}

function verifyUnavailableArm(result, evidence) {
  assert.equal(evidence.execution.executed, false);
  assert.equal(result.report.status, 'inconclusive');
  assert.equal(result.report.oracle.recalculable, false);
  assert.equal(result.report.oracle.unsupportedArm, true);
}

async function run() {
  const root = path.resolve(__dirname, '../../../..');
  const directory = fs.mkdtempSync(path.join(root, '.tmp-socialworld-v2-02-'));
  try {
    assert.deepEqual(REGISTERED_ARMS, ['genos-full', 'static-social-graph', 'llm-with-memory',
      'genos-without-relational-physiology']);
    for (const arm of REGISTERED_ARMS) await verifyArm(arm, directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
    await require('../../../../backend/src/db').closeDatabase();
  }
}

run().then(() => process.stdout.write('V2-02 runtime runner covers all registered arms fail-closed\n'))
  .catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
