'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { executeProbe, summarize } = require('./run-mechanisms.cjs');

test('nonzero exits and timeouts remain failures with preserved logs', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'adaptation-probe-'));
  try {
    const script = path.join(directory, 'failure.cjs');
    fs.writeFileSync(script, 'console.log("negative-control"); process.exitCode = 13;');
    const failed = executeProbe({ script }, directory);
    assert.equal(failed.passed, false);
    assert.equal(failed.exitCode, 13);
    assert.match(fs.readFileSync(path.join(directory, failed.log), 'utf8'), /negative-control/);
    fs.writeFileSync(script, 'setTimeout(() => {}, 60000);');
    const timedOut = executeProbe({ script }, directory, 100);
    assert.equal(timedOut.passed, false);
    assert.equal(timedOut.error, 'ETIMEDOUT');
    assert.equal(summarize([failed, timedOut], true).mechanismChecksPassed, false);
  } finally {
    assert.equal(path.dirname(fs.realpathSync(directory)), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('adaptation-probe-'));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('passing mechanism tests never turn into a causal claim; source drift fails', () => {
  const results = [{ passed: true }];
  const report = summarize(results, true);
  assert.equal(report.mechanismChecksPassed, true);
  assert.deepEqual(Object.values(report.causalBenefit), ['unassessed', 'unassessed', 'unassessed']);
  assert.equal(report.experimentalCampaignExecuted, false);
  assert.equal(report.authorizesPromotion, false);
  assert.equal(summarize(results, false).mechanismChecksPassed, false);
  assert.equal(summarize([], true).mechanismChecksPassed, false);
});
