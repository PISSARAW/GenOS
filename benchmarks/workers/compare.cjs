'use strict';

const fs = require('node:fs');
const { CASES, suiteDigest, score, summary } = require('./campaign.cjs');

async function compare(left, right) {
  if (!left.systemId || !right.systemId || left.systemId === right.systemId) {
    throw new Error('Comparison requires two distinct identified systems.');
  }
  const expected = suiteDigest(CASES);
  if (left.suiteDigest !== expected || right.suiteDigest !== expected) {
    throw new Error('Both reports must use the current identical worker suite.');
  }
  assertComplete(left);
  assertComplete(right);
  await assertScores(left);
  await assertScores(right);
  const rightRows = new Map(right.results.map((row) => [row.id, row]));
  const comparable = left.results.filter((row) => {
    const peer = rightRows.get(row.id);
    return peer && ['passed', 'failed'].includes(row.score) && ['passed', 'failed'].includes(peer.score);
  });
  const comparisons = comparable.map((row) => ({ id: row.id, workerKind: row.workerKind,
    left: row.score, right: rightRows.get(row.id).score,
    leftLatencyMs: row.latencyMs, rightLatencyMs: rightRows.get(row.id).latencyMs }));
  return { leftSystem: left.systemId, rightSystem: right.systemId, left: summary(left), right: summary(right),
    comparableCases: comparisons.length, comparisons };
}

async function assertScores(report) {
  const cases = new Map(CASES.map((item) => [item.id, item]));
  for (const row of report.results) {
    const measured = await score(cases.get(row.id), row.execution);
    if (measured !== row.score) throw new Error(`Campaign score is inconsistent for '${row.id}'.`);
  }
}

function assertComplete(report) {
  const expected = new Set(CASES.map((item) => item.id));
  const actual = (report.results || []).map((item) => item.id);
  if (actual.length !== expected.size || new Set(actual).size !== expected.size
    || actual.some((id) => !expected.has(id))) throw new Error('Campaign report has missing or duplicate cases.');
}

if (require.main === module) {
  (async () => {
    const [leftPath, rightPath] = process.argv.slice(2);
    if (!leftPath || !rightPath) throw new Error('Usage: node compare.cjs <genos.json> <rival.json>');
    const report = await compare(JSON.parse(fs.readFileSync(leftPath, 'utf8')), JSON.parse(fs.readFileSync(rightPath, 'utf8')));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  })().catch((error) => { console.error(error); process.exitCode = 1; });
}

module.exports = { compare };
