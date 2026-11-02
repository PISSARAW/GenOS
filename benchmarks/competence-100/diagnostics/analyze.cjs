'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

function inferRules(examples) {
  const groups = new Map();
  for (const example of examples) {
    const rows = groups.get(example.expression.op) || [];
    rows.push({ x: example.expression.value, y: example.answer });
    groups.set(example.expression.op, rows);
  }
  return Object.fromEntries([...groups].map(([op, rows]) => [op, inferRule(rows)]));
}

function inferRule(rows) {
  const first = rows[0];
  const second = rows.find(row => row.x !== first.x);
  if (!second) throw Error('Insufficient distinct examples');
  const a = (second.y - first.y) / (second.x - first.x);
  const b = first.y - a * first.x;
  if (!rows.every(row => a * row.x + b === row.y)) throw Error('Contradictory examples');
  return { a, b };
}

function solve(expression, rules) {
  if (typeof expression === 'number') return { answer: expression, missing: [] };
  const inner = solve(expression.value, rules);
  const rule = rules[expression.op];
  if (!rule) return { answer: null, missing: [...new Set([...inner.missing, expression.op])] };
  if (inner.missing.length) return inner;
  return { answer: rule.a * inner.answer + rule.b, missing: [] };
}

function summarizeRows(rows) {
  return { n: rows.length, correct: rows.filter(row => row.oracle.numericCorrect).length,
    recognized: rows.filter(row => row.oracle.recognized).length,
    highConfidence: rows.filter(row => row.response.confidence >= 0.8).length,
    abstained: rows.filter(row => row.decision.abstain).length };
}

function publicEvidenceChecks(rows, responses) {
  const checks = rows.map(row => {
    const prompt = JSON.parse(responses.get(row.responseEvent).prompt);
    const rules = inferRules(prompt.verifiedTrainingExamples);
    const solved = solve(prompt.expression, rules);
    if (row.oracle.answerable) assert.equal(solved.answer, row.oracle.expected);
    else assert.deepEqual([...solved.missing].sort(), [...row.oracle.missing].sort());
    return { id: row.taskId, answerable: row.oracle.answerable, solved };
  });
  return { checked: checks.length, answerableExactlySolved: checks.filter(row => row.answerable).length,
    unknownGapsExactlyRecovered: checks.filter(row => !row.answerable).length };
}

function byOperator(rows, responses) {
  const groups = new Map();
  for (const row of rows.filter(item => item.family === 'new_input')) {
    const prompt = JSON.parse(responses.get(row.responseEvent).prompt);
    const op = prompt.expression.op;
    const group = groups.get(op) || { op, rule: inferRules(prompt.verifiedTrainingExamples)[op], rows: [] };
    group.rows.push(row);
    groups.set(op, group);
  }
  return [...groups.values()].map(group => ({ op: group.op, rule: group.rule, ...summarizeRows(group.rows) }));
}

function unknownContext(rows, responses) {
  const unknown = rows.filter(row => !row.oracle.answerable);
  const empty = unknown.filter(row => JSON.parse(responses.get(row.responseEvent).prompt).verifiedTrainingExamples.length === 0);
  const familiar = unknown.filter(row => !empty.includes(row));
  return { noExamples: summarizeRows(empty), familiarExamplesPresent: summarizeRows(familiar) };
}

function recallPlateau(rows, responses) {
  const training = rows.filter(item => item.phase === 'training');
  const seen = new Set();
  const trajectory = [];
  for (const [index, row] of training.entries()) {
    const prompt = JSON.parse(responses.get(row.responseEvent).prompt);
    for (const example of prompt.verifiedTrainingExamples) seen.add(JSON.stringify(example));
    trajectory.push({ episode: index + 1, uniqueRecalled: seen.size });
  }
  const testExamples = new Set();
  for (const row of rows.filter(item => item.phase === 'heldout' && item.arm === 'experienced')) {
    const prompt = JSON.parse(responses.get(row.responseEvent).prompt);
    for (const example of prompt.verifiedTrainingExamples) testExamples.add(JSON.stringify(example));
  }
  const prefix = training.slice(0, 12).map(row => ({
    expression: JSON.parse(responses.get(row.responseEvent).prompt).expression, answer: row.oracle.expected
  }));
  const identical = rows.filter(row => row.phase === 'heldout' && row.arm === 'experienced').every(row => {
    const prompt = JSON.parse(responses.get(row.responseEvent).prompt);
    return JSON.stringify(recallPrefix(prompt.expression, prefix))
      === JSON.stringify(prompt.verifiedTrainingExamples);
  });
  return { storedTrainingEpisodes: 100, distinctExamplesRecalledInHeldout: testExamples.size,
    heldoutPromptsIdenticalAt12And100: identical,
    lastNewExampleExposedAtTrainingEpisode: trajectory.find(row => row.uniqueRecalled === seen.size).episode,
    early: summarizeRows(rows.filter(row => row.phase === 'training').slice(0, 12)),
    late: summarizeRows(rows.filter(row => row.phase === 'training').slice(12)) };
}

function recallPrefix(expression, rows) {
  const wanted = new Set();
  for (let node = expression; typeof node !== 'number'; node = node.value) wanted.add(node.op);
  const counts = {};
  return rows.filter(example => {
    const op = example.expression.op;
    if (!wanted.has(op)) return false;
    counts[op] = (counts[op] || 0) + 1;
    return counts[op] <= 3;
  });
}

function analyze(directory) {
  const rows = JSON.parse(fs.readFileSync(path.join(directory, 'measurements.json')));
  const events = fs.readFileSync(path.join(directory, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const responses = new Map(events.filter(event => event.type === 'response').map(event => [event.hash, event]));
  const experienced = rows.filter(row => row.phase === 'heldout' && row.arm === 'experienced');
  return { schema: 'genos.competence-100.failure-analysis/v1', analysis: 'posthoc-descriptive-no-confirmatory-claim',
    publicEvidence: publicEvidenceChecks(experienced, responses), byOperator: byOperator(experienced, responses),
    unknownContext: unknownContext(experienced, responses), recall: recallPlateau(rows, responses),
    incorrectAccepted: experienced.filter(row => !row.oracle.numericCorrect && !row.decision.abstain).length,
    truncatedResponses: [...responses.values()].filter(event => event.result.doneReason === 'length').length };
}

if (require.main === module) {
  const report = analyze(process.argv[2]);
  fs.writeFileSync(process.argv[3], JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

module.exports = { inferRules, solve, analyze };
