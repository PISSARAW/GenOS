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
assert.deepStrictEqual(diff.churnHeatmap.map((entry) => entry.collisionRisk), ['HIGH', 'HIGH']);
assert.throws(() => diffWorkspaces('base', 'target', { diffEntries: [{ file: 'bad.js', additions: NaN, deletions: 0 }] }), /Diff counts must be non-negative numbers/);

console.log('Bisection diff blast-radius checks passed.');

const bisection = require('../src/services/bisectionService');
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
  console.log('Bisection monotonicity and evidence checks passed.');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});