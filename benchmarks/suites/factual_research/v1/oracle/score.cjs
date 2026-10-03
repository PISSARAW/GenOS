const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SUITE_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(SUITE_DIR, 'public');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function verifySources() {
  const lock = readJson(path.join(PUBLIC_DIR, 'sources.lock.json'));
  const facts = new Set();
  for (const file of lock.files) {
    const content = fs.readFileSync(path.join(PUBLIC_DIR, 'sources', file.path));
    if (crypto.createHash('sha256').update(content).digest('hex') !== file.sha256) throw new Error(`Frozen source changed: ${file.path}`);
    const source = JSON.parse(content.toString('utf8'));
    if (source.sourceId !== file.sourceId || source.url !== file.url) throw new Error(`Source identity mismatch: ${file.path}`);
    for (const fact of source.facts) facts.add(`${source.sourceId}|${fact.section}|${fact.factId}`);
  }
  return { lock, facts };
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])]));
  return value;
}

function scoreOne(prediction, answer, sourceFacts) {
  const keys = Object.keys(answer.claims);
  const correct = keys.filter((key) => JSON.stringify(normalize(prediction.claims?.[key])) === JSON.stringify(normalize(answer.claims[key]))).length;
  const citations = Array.isArray(prediction.citations) ? prediction.citations : [];
  const expected = answer.citations.map((citation) => `${citation.sourceId}|${citation.section}|${citation.factId}`);
  const valid = citations.map((citation) => sourceFacts.has(`${citation.sourceId}|${citation.section}|${citation.factId}`));
  const matched = new Set(citations.filter((citation, index) => valid[index]).map((citation) => `${citation.sourceId}|${citation.section}|${citation.factId}`));
  const citationRecall = expected.filter((item) => matched.has(item)).length / expected.length;
  const citationPrecision = citations.length ? valid.filter(Boolean).length / citations.length : 0;
  const claimAccuracy = correct / keys.length;
  return {
    taskId: prediction.taskId,
    claimAccuracy,
    citationRecall,
    citationPrecision,
    weightedScore: claimAccuracy * 0.5 + citationRecall * 0.3 + citationPrecision * 0.2,
    correctClaims: correct,
    requiredClaims: keys.length,
    matchedCitations: expected.filter((item) => matched.has(item)).length,
    requiredCitations: expected.length
  };
}

function scorePredictions(predictions) {
  const sourceState = verifySources();
  const key = readJson(path.join(__dirname, 'answer-key.json'));
  const results = predictions.map((prediction) => {
    const answer = key.tasks[prediction.taskId];
    return answer ? scoreOne(prediction, answer, sourceState.facts) : { taskId: prediction.taskId || null, weightedScore: 0, error: 'unknown_task_id' };
  });
  const meanScore = results.length ? results.reduce((sum, result) => sum + result.weightedScore, 0) / results.length : null;
  return { schemaVersion: 1, corpusVersion: sourceState.lock.corpusVersion, itemCount: results.length, meanScore, results };
}

function readJsonl(filePath) {
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

if (require.main === module) {
  if (!process.argv[2]) throw new Error('Usage: node score.cjs <predictions.jsonl>');
  console.log(JSON.stringify(scorePredictions(readJsonl(process.argv[2])), null, 2));
}

module.exports = { scorePredictions, verifySources };
