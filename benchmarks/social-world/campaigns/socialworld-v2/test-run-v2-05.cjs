'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'social-v205-runner-test-only';
const assert = require('node:assert/strict');
const path = require('node:path');
const { runScenario, REGISTERED_ARMS, EXECUTABLE_ARMS, resolveModelPlan } = require('./run-v2-05.cjs');
const { runnerDescriptor } = require('./runner-registry.cjs');
const { validateReport } = require('./validate-report.cjs');

function assertFullArm(observed) {
  assert.equal(observed.effectiveTransitions, 2);
  assert.deepEqual(observed.transitionJournalVersions, [1, 2]);
  assert.equal(observed.unauthorizedChangeRejected, true);
  for (const transition of observed.transitions) {
    assert.equal(transition.identityPreserved, true);
    assert.equal(transition.validRelationsPreserved, true);
    assert.equal(transition.permissionsPreserved, true);
    assert.equal(transition.provenancePreserved, true);
    assert.equal(transition.collaborationReceipt, true);
  }
}

function assertStaticGraphArm(observed) {
  assert.equal(observed.effectiveTransitions, 2);
  assert.equal(observed.treatmentEvidence.mode, 'static-social-graph');
  assert.equal(observed.treatmentEvidence.staticGraphUnchanged, true);
  assert.deepEqual(observed.treatmentEvidence.finalRelationSnapshot,
    observed.treatmentEvidence.initialRelationSnapshot);
  assert.equal(observed.transitions.every((item) => item.collaborationReceipt), true);
}

function assertArmOutcome(arm, result) {
  if (arm === 'genos-full') {
    assert.equal(result.report.status, 'pass');
    assertFullArm(result.report.observed);
  } else if (arm === 'static-social-graph') {
    assert.equal(result.report.status, 'pass');
    assertStaticGraphArm(result.report.observed);
  } else if (arm === 'genos-without-relational-physiology') {
    assert.equal(result.report.status, 'pass');
    assert.deepEqual(result.report.observed.treatmentEvidence, { mode: 'relational-physiology-disabled',
      relationCount: 0, relationalPhysiologyApplied: false });
    assert.equal(result.report.observed.transitions.every((item) => item.validRelationsPreserved
      && item.collaborationReceipt), true);
  } else if (arm === 'llm-with-memory') {
    assert.equal(result.report.status, 'pass');
  } else {
    assert.equal(result.report.status, 'inconclusive');
    assert.match(result.report.oracle.reason, /no implemented runtime adapter/);
    assert.deepEqual(result.evidence, []);
  }
}

async function run() {
  const manifest = require('./manifest.json');
  const expected = manifest.comparisonArms['V2-05'];
  assert.deepEqual(REGISTERED_ARMS, expected);
  assert.deepEqual(EXECUTABLE_ARMS, ['genos-full', 'static-social-graph', 'llm-with-memory', 'genos-without-relational-physiology']);
  assert.deepEqual(resolveModelPlan('{"order":["red_blue_coevolution","cross_functional_pod"]}', [
    { organization: 'cross_functional_pod' }, { organization: 'red_blue_coevolution' }
  ]).map((item) => item.organization), ['red_blue_coevolution', 'cross_functional_pod']);
  assert.throws(() => resolveModelPlan('{"order":["unregistered"]}', []), /outside the preregistered plan/);
  assert.deepEqual(runnerDescriptor('V2-05').executableArms, EXECUTABLE_ARMS);
  const outputDirectory = path.join(__dirname, 'reports');
  let comparison;
  for (const arm of expected) {
    if (arm === 'llm-with-memory' && !process.env.GENOS_DEFAULT_MODEL && !process.env.LLM_PROVIDER) continue;
    const result = await runScenario({ seed: 'socialworld-v2-05-01', arm, attempt: 1,
      outputDirectory, sourceCommit: 'deterministic-test' });
    const reportPath = path.join(outputDirectory, `V2-05-${arm}-test-report.json`);
    assert.deepEqual(validateReport(result.report, reportPath, path.resolve(__dirname, '../../../..')), []);
    assert.deepEqual(Object.keys(result.report.inputs.comparison).sort(), ['budgetHash', 'eventsHash', 'permissionsHash']);
    for (const digest of Object.values(result.report.inputs.comparison)) assert.match(digest, /^[a-f0-9]{64}$/);
    if (comparison) assert.deepEqual(result.report.inputs.comparison, comparison);
    comparison = result.report.inputs.comparison;
    assertArmOutcome(arm, result);
  }
}

run().then(() => process.stdout.write('SocialWorld V2-05 runner tests passed\n'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
