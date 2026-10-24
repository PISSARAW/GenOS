'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'social-v2-run-v201-test-only';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { REGISTERED_ARMS, EXECUTABLE_ARMS, runScenario } = require('./run-v2-01.cjs');
const { validateReport } = require('./validate-report.cjs');

async function main() {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-v201-runner-'));
  try {
    assert.deepEqual(REGISTERED_ARMS, [
      'genos-full', 'static-social-graph', 'llm-with-memory', 'genos-without-relational-physiology'
    ]);
    assert.deepEqual(EXECUTABLE_ARMS, [], 'the current services do not implement a complete V2-01 comparison arm');
    const results = [];
    for (const arm of REGISTERED_ARMS) {
      results.push(await runScenario({ seed: 'socialworld-v2-01', arm, attempt: 1,
        outputDirectory, sourceCommit: '0123456789abcdef0123456789abcdef01234567' }));
    }
    for (const result of results) {
      assert.equal(result.report.scenario, 'V2-01');
      assert.equal(result.report.status, 'inconclusive', 'partial service evidence cannot pass the scenario');
      assert.equal(result.report.oracle.recalculable, false);
      assert.equal(validateReport(result.report, result.reportPath, path.resolve(__dirname, '../../../..')).length, 0);
      assert.ok(fs.existsSync(result.evidencePath));
      assert.ok(fs.existsSync(result.reportPath));
    }
    const diagnostic = results.find((entry) => entry.report.arm === 'genos-full');
    if (diagnostic.evidence.execution.executed) {
      assert.deepEqual(diagnostic.evidence.service.session.turns.map((turn) => turn.speaker),
        ['agent-a', 'agent-b', 'agent-a', 'agent-b']);
      assert.deepEqual(diagnostic.report.observed.checks, {
        fourAlternatingTurns: true, memoryMutatedForBoth: true, sourceReferencePersisted: true,
        recalledForBoth: true, verifiedDeliveryReceipts: false, armIsolationVerified: false
      });
    } else {
      assert.equal(diagnostic.report.status, 'inconclusive');
      assert.equal(diagnostic.report.oracle.recalculable, false);
      assert.equal(diagnostic.evidence.execution.executed, false);
    }
    for (const arm of REGISTERED_ARMS.filter((value) => value !== 'genos-full')) {
      const comparator = results.find((entry) => entry.report.arm === arm);
      assert.equal(comparator.evidence.unsupported, true);
      assert.equal(comparator.report.inputs.databaseMode, 'not-run');
      assert.ok(comparator.report.limitations.some((item) => item.includes('was not mapped to another arm')));
    }
    const comparisonHashes = results.map((entry) => entry.report.inputs.comparison);
    assert.ok(comparisonHashes.every((value) => JSON.stringify(value) === JSON.stringify(comparisonHashes[0])));
    const unsupportedModel = await runScenario({ seed: 'socialworld-v2-01', arm: 'llm-with-memory', attempt: 1,
      outputDirectory, sourceCommit: '0123456789abcdef0123456789abcdef01234567', model: 'unconfigured-model' });
    assert.equal(unsupportedModel.report.status, 'inconclusive');
    assert.equal(unsupportedModel.report.oracle.recalculable, false);
    assert.match(unsupportedModel.report.limitations[0], /custom model or configuration is unsupported/);
    console.log('V2-01 runner covers all manifest arms; actual bounded dialogue/memory is measured and incomplete arms remain inconclusive.');
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
