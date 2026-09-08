const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../src/controllers/swarmController'), 'utf8');
assert.match(source, /AVG\(brier_score\)/);
assert.match(source, /evaluation_runs/);
assert.doesNotMatch(source, /else if \(Number\.isFinite\(inputWeight\)/);
console.log('Swarm Brier weights are sourced from server-side evaluation history.');