const assert = require('assert');
const { diffWorkspaces } = require('../src/services/bisectionService');

const diff = diffWorkspaces('base', 'target', {
  diffEntries: [
    { file: 'src/a.js', additions: 2, deletions: 1, collisionRisk: 'LOW' },
    { file: 'src/a.js', additions: 1, deletions: 0 }
  ]
});

assert.strictEqual(diff.totalAdditions, 3);
assert.strictEqual(diff.totalDeletions, 1);
assert.strictEqual(diff.totalFilesChanged, 1);
assert.deepStrictEqual(diff.churnHeatmap.map((entry) => entry.collisionRisk), ['HIGH', 'HIGH']);
assert.throws(() => diffWorkspaces('base', 'target', { diffEntries: [{ file: 'bad.js', additions: NaN, deletions: 0 }] }), /Diff counts must be non-negative numbers/);

console.log('Bisection diff blast-radius checks passed.');

const bisection = require('../src/services/bisectionService');
const invalidSyncBaseline = bisection.bisectAnomaly([
  { step: 1, healthy: false },
  { step: 2, healthy: false }
]);
assert.strictEqual(invalidSyncBaseline.bisectionComplete, false);
assert.match(invalidSyncBaseline.reason, /healthy baseline/);
const syncRegression = bisection.bisectAnomaly([
  { step: 1, healthy: true },
  { step: 2, healthy: true },
  { step: 3, healthy: false }
]);
assert.strictEqual(syncRegression.culpritReport.stepNumber, 3);
assert.strictEqual(syncRegression.culpritReport.lastHealthy.stepNumber, 2);
console.log('Synchronous bisection baseline checks passed.');

Promise.resolve(bisection.bisectAnomalyAsync([
  { step: 1, healthy: true },
  { step: 2, healthy: false },
  { step: 3, healthy: true }
])).then((result) => {
  assert.strictEqual(result.bisectionComplete, false);
  assert.match(result.reason, /non-monotonic/);
  return bisection.bisectAnomalyAsync([{ step: 1, label: 'unknown' }, { step: 2, label: 'unknown' }]);
}).then((result) => {
  assert.strictEqual(result.bisectionComplete, false);
  assert.match(result.reason, /boolean health/);
  return bisection.bisectAnomalyAsync([{ step: 1, healthy: false }, { step: 2, healthy: false }]);
}).then((result) => {
  assert.strictEqual(result.bisectionComplete, false);
  assert.match(result.reason, /healthy baseline/);
  let evaluations = 0;
  return bisection.bisectAnomalyAsync(
    [{ step: 1 }, { step: 2 }],
    async () => { evaluations += 1; return evaluations % 2 === 0; }
  );
}).then((result) => {
  assert.strictEqual(result.bisectionComplete, false);
  assert.match(result.reason, /unstable/);
  return bisection.bisectAnomalyAsync([{ step: 1, healthy: true }, { step: 2, healthy: false }]);
}).then((result) => {
  assert.equal(result.evidenceLevel, 'regression_indicator');
  assert.equal(result.causalGuarantee, false);
  console.log('Bisection monotonicity, evidence, and stability checks passed.');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
