'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { runScenario, REGISTERED_ARMS, EXECUTABLE_ARMS, DIAGNOSTIC_ARMS, environmentEvents } = require('./run-v2-02.cjs');

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function verifyArm(arm, directory) {
  const result = await runScenario({ seed: 'socialworld-v2-test-seed', arm, attempt: 1,
    outputDirectory: directory, sourceCommit: '0123456789abcdef0123456789abcdef01234567' });
  assert.equal(result.report.scenario, 'V2-02');
  assert.equal(result.report.arm, arm);
  assert.equal(result.report.seed, 'socialworld-v2-test-seed');
  assert.ok(['pass', 'fail', 'inconclusive'].includes(result.report.status));
  assert.deepEqual(result.report.inputs.comparison, {
    eventsHash: digest(JSON.stringify(environmentEvents('socialworld-v2-test-seed'))),
    budgetHash: digest(JSON.stringify({ requestedWorldCycles: 1000, checkpointEvaluations: 10, maxCandidates: 10, maxCost: 50 })),
    permissionsHash: digest(JSON.stringify({ organizationId: 'socialworld-v2-org', projectId: 'socialworld-v2-project',
      population: 24, allowedActors: Array.from({ length: 24 }, (_, index) => `socialworld-v2-${String(index).padStart(2, '0')}`) }))
  });
  const evidencePath = path.join(directory, result.report.evidenceRefs[0]);
  assert.ok(fs.existsSync(evidencePath));
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  assert.equal(evidence.arm, arm);
  assert.equal(evidence.seed, result.report.seed);
  assert.deepEqual(evidence.worldEvents, environmentEvents(result.report.seed));
  if (DIAGNOSTIC_ARMS.includes(arm) && evidence.execution.executed) verifyRuntimeEvidence(result, evidence);
  else if (DIAGNOSTIC_ARMS.includes(arm)) verifyUnavailableDiagnostic(result, evidence);
  else verifyUnavailableArm(result, evidence);
}

function verifyRuntimeEvidence(result, evidence) {
  assert.equal(evidence.execution.executed, true);
  assert.equal(evidence.events.length, 10);
  assert.equal(evidence.interactions.length, 10);
  assert.equal(evidence.execution.requestedWorldCycles, 1000);
  assert.equal(evidence.execution.checkpointEvaluations, 10);
  assert.equal(evidence.execution.autonomousAgentCycles, 0);
  assert.equal(result.report.oracle.unsupportedArm, false);
  assert.equal(result.report.status, 'inconclusive', 'the checkpoint diagnostic cannot claim 1000 autonomous cycles');
  assert.equal(result.report.observed.initiatives, 0, 'environment-triggered sends are not autonomous initiatives');
  assert.equal(result.report.oracle.checks.autonomousInitiatives, false);
}

function verifyUnavailableArm(result, evidence) {
  assert.equal(evidence.execution.executed, false);
  assert.equal(result.report.status, 'inconclusive');
  assert.equal(result.report.oracle.recalculable, false);
  assert.equal(result.report.oracle.unsupportedArm, true);
}

function verifyUnavailableDiagnostic(result, evidence) {
  assert.equal(evidence.execution.executed, false);
  assert.equal(result.report.status, 'inconclusive');
  assert.equal(result.report.oracle.recalculable, false);
  assert.ok(result.report.limitations[0]);
}

async function run() {
  const root = path.resolve(__dirname, '../../../..');
  const directory = fs.mkdtempSync(path.join(root, '.tmp-socialworld-v2-02-'));
  try {
    assert.deepEqual(REGISTERED_ARMS, ['genos-full', 'static-social-graph', 'llm-with-memory',
      'genos-without-relational-physiology']);
    assert.deepEqual(EXECUTABLE_ARMS, [], 'there is no complete autonomous V2-02 proof treatment');
    assert.deepEqual(DIAGNOSTIC_ARMS, ['genos-full']);
    for (const arm of REGISTERED_ARMS) await verifyArm(arm, directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

run().then(() => process.stdout.write('V2-02 runtime runner covers all registered arms fail-closed\n'))
  .catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
