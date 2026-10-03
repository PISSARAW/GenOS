const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { scorePredictions, verifySources } = require('./score.cjs');

const SUITE_DIR = path.resolve(__dirname, '..');
const key = JSON.parse(fs.readFileSync(path.join(__dirname, 'answer-key.json'), 'utf8'));

function smoke() {
  verifySources();
  const perfect = Object.entries(key.tasks).map(([taskId, answer]) => ({ taskId, claims: answer.claims, citations: answer.citations }));
  const perfectScore = scorePredictions(perfect);
  assert.equal(perfectScore.meanScore, 1);
  const bad = perfect.map((item, index) => index === 0 ? { ...item, citations: [{ sourceId: 'invented', section: '0', factId: 'none' }] } : item);
  const badScore = scorePredictions(bad);
  assert.ok(badScore.meanScore < perfectScore.meanScore);
  assert.equal(perfectScore.itemCount, Object.keys(key.tasks).length);
  return { perfectMean: perfectScore.meanScore, perturbedMean: badScore.meanScore, itemCount: perfectScore.itemCount, suiteDir: SUITE_DIR };
}

console.log(JSON.stringify(smoke(), null, 2));
