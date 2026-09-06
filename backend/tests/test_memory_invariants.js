const assert = require('assert');
const scoring = require('../src/services/memoryScoring');
const trajectory = require('../src/services/trajectoryService');

const scored = scoring.scoreCorpusItem(
  { id: 'memory-a', title: 'SQLite', summary: 'WAL concurrency', tags: ['sqlite'], distance: 2, rrf_score: 1, synaptic_weight: 20, status: 'SUCCESS' },
  { query: 'sqlite' }
);
assert.equal(scored.cosineMetric, 0);
assert.ok(scored.similarityScore >= 0 && scored.similarityScore <= 1);
assert.throws(() => trajectory.cherryPickGoldenPath([]), /At least one trajectory turn/);

console.log('Memory invariants: ok');
