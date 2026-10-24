'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'social-v205-runner-test-only';
const assert = require('node:assert/strict');
const path = require('node:path');
const { runScenario, REGISTERED_ARMS, EXECUTABLE_ARMS } = require('./run-v2-05.cjs');
const { runnerDescriptor } = require('./runner-registry.cjs');
const { validateReport } = require('./validate-report.cjs');

async function run() {
  const manifest = require('./manifest.json');
  const expected = manifest.comparisonArms['V2-05'];
  assert.deepEqual(REGISTERED_ARMS, expected);
  assert.deepEqual(EXECUTABLE_ARMS, ['genos-full', 'static-social-graph']);
  assert.deepEqual(runnerDescriptor('V2-05').executableArms, EXECUTABLE_ARMS);
  const outputDirectory = path.join(__dirname, 'reports');
  let comparison;
  for (const arm of expected) {
    const result = await runScenario({ seed: 'socialworld-v2-05-01', arm, attempt: 1,
      outputDirectory, sourceCommit: 'deterministic-test' });
    const reportPath = path.join(outputDirectory, `V2-05-${arm}-test-report.json`);
    assert.deepEqual(validateReport(result.report, reportPath, path.resolve(__dirname, '../../../..')), []);
    assert.deepEqual(Object.keys(result.report.inputs.comparison).sort(), ['budgetHash', 'eventsHash', 'permissionsHash']);
    for (const digest of Object.values(result.report.inputs.comparison)) assert.match(digest, /^[a-f0-9]{64}$/);
    if (comparison) assert.deepEqual(result.report.inputs.comparison, comparison);
    comparison = result.report.inputs.comparison;
    if (arm === 'genos-full') {
      assert.equal(result.report.status, 'pass');
      assert.equal(result.report.observed.effectiveTransitions, 2);
      assert.deepEqual(result.report.observed.transitionJournalVersions, [1, 2]);
      assert.equal(result.report.observed.unauthorizedChangeRejected, true);
      for (const transition of result.report.observed.transitions) {
        assert.equal(transition.identityPreserved, true);
        assert.equal(transition.validRelationsPreserved, true);
        assert.equal(transition.permissionsPreserved, true);
        assert.equal(transition.provenancePreserved, true);
        assert.equal(transition.collaborationReceipt, true);
      }
    } else if (arm === 'static-social-graph') {
      assert.equal(result.report.status, 'pass');
      assert.equal(result.report.observed.effectiveTransitions, 2);
      assert.equal(result.report.observed.treatmentEvidence.mode, 'static-social-graph');
      assert.equal(result.report.observed.treatmentEvidence.staticGraphUnchanged, true);
      assert.deepEqual(result.report.observed.treatmentEvidence.finalRelationSnapshot,
        result.report.observed.treatmentEvidence.initialRelationSnapshot);
      assert.equal(result.report.observed.transitions.every((item) => item.collaborationReceipt), true);
    } else {
      assert.equal(result.report.status, 'inconclusive');
      assert.match(result.report.oracle.reason, /no implemented runtime adapter/);
      assert.deepEqual(result.evidence, []);
    }
  }
}

run().then(() => process.stdout.write('SocialWorld V2-05 runner tests passed\n'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
