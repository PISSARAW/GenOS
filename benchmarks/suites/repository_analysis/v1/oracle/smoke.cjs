const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { scorePredictions, verifySnapshot } = require('./score.cjs');

const PUBLIC_DIR = path.resolve(__dirname, '../public');
const questions = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'questions.json'), 'utf8'));
const key = JSON.parse(fs.readFileSync(path.join(__dirname, 'answer-key.json'), 'utf8'));

function quoteEvidence(evidence) {
  const source = fs.readFileSync(path.join(PUBLIC_DIR, 'snapshot', evidence.path), 'utf8').split(/\r?\n/);
  return {
    path: evidence.path,
    startLine: evidence.startLine,
    endLine: evidence.endLine,
    quote: source.slice(evidence.startLine - 1, evidence.endLine).join('\n')
  };
}

function checkOracle() {
  verifySnapshot();
  const perfect = questions.items.map((item) => ({
    taskId: item.taskId,
    claims: key.tasks[item.taskId].claims,
    citations: key.tasks[item.taskId].evidence.map(quoteEvidence)
  }));
  const correctScore = scorePredictions(perfect);
  assert.equal(correctScore.meanScore, 1);
  const wrong = perfect.map((prediction, index) => index === 0
    ? { ...prediction, claims: { ...prediction.claims, backendCommand: 'invented command' } }
    : prediction);
  const wrongScore = scorePredictions(wrong);
  assert.ok(wrongScore.meanScore < correctScore.meanScore);
  assert.equal(correctScore.results.length, questions.items.length);
  return { perfectMean: correctScore.meanScore, perturbedMean: wrongScore.meanScore, itemCount: correctScore.itemCount };
}

console.log(JSON.stringify(checkOracle(), null, 2));
