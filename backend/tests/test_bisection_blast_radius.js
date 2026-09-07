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