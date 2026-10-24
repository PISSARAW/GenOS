'use strict';

const assert = require('node:assert/strict');
const { compareRuns, validateRun } = require('./score.cjs');

const run = (system, integrity, replay) => ({
  schema: 'genos.agentgit-benchmark/v1', system, version: '1.0', adapter: 'manual-receipt', collectedAt: '2026-10-24',
  tasks: [{ id: 'commit-integrity', metrics: {
    integrity: { result: integrity, evidence: `${system}-integrity` },
    replay: { result: replay, evidence: `${system}-replay` }
  } }]
});

const left = run('GenOS', 'pass', 'unsupported');
const right = run('Competitor', 'fail', 'pass');
assert.equal(validateRun(left).valid, true);
const report = compareRuns([left, right]);
assert.equal(report.success, true);
assert.deepEqual(report.comparableTaskIds, ['commit-integrity']);
assert.equal(report.systems[0].metrics.integrity.pass, 1);
assert.equal(report.systems[1].metrics.integrity.fail, 1);
assert.equal(report.ranking, null);

const invalid = run('Missing evidence', 'pass', 'pass');
invalid.tasks[0].metrics.integrity.evidence = '';
assert.equal(validateRun(invalid).valid, false);
console.log('AgentGit benchmark scoring passed.');
