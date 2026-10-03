const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SUITE_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(SUITE_DIR, 'public');
const SNAPSHOT_DIR = path.join(PUBLIC_DIR, 'snapshot');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function verifySnapshot() {
  const lock = readJson(path.join(PUBLIC_DIR, 'snapshot.lock.json'));
  const files = lock.files.map((entry) => {
    const content = fs.readFileSync(path.join(SNAPSHOT_DIR, entry.path));
    const actual = crypto.createHash('sha256').update(content).digest('hex');
    return { path: entry.path, expected: entry.sha256, actual, valid: actual === entry.sha256 };
  });
  if (files.some((file) => !file.valid)) throw new Error('Snapshot hash mismatch.');
  return lock;
}

function isCitationRangeValid(citation, evidence) {
  if (citation.path !== evidence.path) return false;
  if (citation.startLine < evidence.startLine || citation.endLine > evidence.endLine) return false;
  if (!Number.isInteger(citation.startLine) || !Number.isInteger(citation.endLine) || citation.startLine > citation.endLine) return false;
  return true;
}

function hasRequiredAnchors(excerpt, evidence) {
  const anchors = [evidence.anchor, ...(evidence.alsoContains || [])];
  for (const anchor of anchors) {
    if (!excerpt.includes(anchor)) return false;
  }
  return true;
}

function citeEvidence(citation, evidence) {
  if (!isCitationRangeValid(citation, evidence)) return false;
  const content = fs.readFileSync(path.join(SNAPSHOT_DIR, evidence.path), 'utf8').split(/\r?\n/);
  const excerpt = content.slice(citation.startLine - 1, citation.endLine).join('\n');
  if (!citation.quote || !excerpt.includes(citation.quote)) return false;
  return hasRequiredAnchors(excerpt, evidence);
}

function scoreTask(response, answer) {
  const claims = response.claims || {};
  const claimKeys = Object.keys(answer.claims);
  const correctClaims = claimKeys.filter((key) => JSON.stringify(canonical(claims[key])) === JSON.stringify(canonical(answer.claims[key]))).length;
  const claimAccuracy = correctClaims / claimKeys.length;
  const citations = Array.isArray(response.citations) ? response.citations : [];
  const evidenceMatched = answer.evidence.map((evidence) => citations.some((citation) => citeEvidence(citation, evidence)));
  const citationRecall = evidenceMatched.filter(Boolean).length / answer.evidence.length;
  const citationPrecision = citations.length
    ? citations.filter((citation) => answer.evidence.some((evidence) => citeEvidence(citation, evidence))).length / citations.length
    : 0;
  const weightedScore = claimAccuracy * 0.5 + citationRecall * 0.3 + citationPrecision * 0.2;
  return {
    taskId: response.taskId,
    claimAccuracy,
    citationRecall,
    citationPrecision,
    weightedScore,
    correctClaims,
    requiredClaims: claimKeys.length,
    matchedEvidence: evidenceMatched.filter(Boolean).length,
    requiredEvidence: answer.evidence.length
  };
}

function scorePredictions(predictions) {
  const key = readJson(path.join(__dirname, 'answer-key.json'));
  const results = predictions.map((prediction) => {
    const answer = key.tasks[prediction.taskId];
    if (!answer) return { taskId: prediction.taskId || null, error: 'unknown_task_id', weightedScore: 0 };
    return scoreTask(prediction, answer);
  });
  const meanScore = results.length
    ? results.reduce((sum, result) => sum + result.weightedScore, 0) / results.length
    : null;
  return { schemaVersion: 1, snapshot: verifySnapshot().revision, itemCount: results.length, meanScore, results };
}

function readPredictions(filePath) {
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

if (require.main === module) {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error('Usage: node score.cjs <predictions.jsonl>');
  console.log(JSON.stringify(scorePredictions(readPredictions(inputPath)), null, 2));
}

module.exports = { scorePredictions, verifySnapshot };
