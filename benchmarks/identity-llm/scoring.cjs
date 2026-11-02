'use strict';
const protocol = require('./protocol.json');
const { relation, causalPath } = require('./corpus.cjs');

function valid(value) {
  return value && typeof value === 'object' && typeof value.confidence === 'number'
    && value.confidence >= 0 && value.confidence <= 1 && Object.hasOwn(value, 'answer');
}

function identity(w, context, result) {
  const value = result.value || {};
  return { self: value.self === context.actor, origin: value.origin === w.origin,
    path: JSON.stringify(value.path) === JSON.stringify(causalPath(w, context.actor, context.target)),
    relation: value.relation === relation(w, context.actor, context.target),
    author: value.author === context.expectedAuthor, ownership: value.ownership === context.expectedOwnership };
}

function answer(result, oracle) {
  const value = result.value;
  const isValid = Boolean(valid(value));
  const exact = isValid && value.answer === oracle.expected;
  const confidence = isValid ? value.confidence : 1;
  return { valid: isValid, exact, solvable: oracle.solvable,
    unknownRecognized: !oracle.solvable && exact && confidence <= 0.2,
    brier: (confidence - Number(exact && oracle.solvable)) ** 2 };
}

function wilsonLower(successes, total) {
  if (!total) return 0;
  const z = 2.78;
  const p = successes / total;
  const z2 = z * z;
  return (p + z2 / (2 * total) - z * Math.sqrt(p * (1 - p) / total + z2 / (4 * total ** 2))) / (1 + z2 / total);
}

function rate(rows, key) {
  const successes = rows.filter(row => row[key]).length;
  return { successes, total: rows.length, rate: successes / rows.length, lower: wilsonLower(successes, rows.length) };
}

function identitySummary(rows) {
  const items = rows.filter(row => row.type === 'train-result');
  const scores = items.map(row => row.identity);
  const rates = Object.fromEntries(['self', 'origin', 'path', 'relation', 'author', 'ownership'].map(key => [key, rate(scores, key)]));
  const late = scores.slice(-protocol.chunkSize).filter(row => Object.values(row).every(Boolean)).length / protocol.chunkSize;
  const strict = ['self', 'origin'].every(key => rates[key].rate >= protocol.identityMinimumObserved
    && rates[key].lower >= protocol.identityMinimumLowerBound);
  const other = ['path', 'relation', 'author', 'ownership'].every(key => rates[key].rate >= protocol.relationMinimumObserved);
  const clones = rows.filter(row => row.type === 'clone-result').map(row => row.identity);
  return { rates, lateJointRate: late, cloneJointRate: clones.filter(row => Object.values(row).every(Boolean)).length / clones.length,
    passed: strict && other && late >= protocol.lateWindowMinimumObserved
      && clones.every(row => Object.values(row).every(Boolean)) };
}

function comparison(rows, input) {
  const learned = rows.filter(row => row.arm === 'learned' && row.task.family === input.family && row.score.solvable);
  const byId = new Map(rows.filter(row => row.arm === input.control).map(row => [row.task.id, row]));
  const gain = learned.reduce((sum, row) => sum + Number(row.score.exact) - Number(byId.get(row.task.id).score.exact), 0) / learned.length;
  const lower = gain - Math.sqrt(2 * Math.log(protocol.simultaneousComparisons / protocol.familywiseAlpha) / learned.length);
  return { family: input.family, control: input.control, tasks: learned.length, gain, lower,
    passed: lower > protocol.minimumLearningGainLowerBound };
}

function learningSummary(events) {
  const rows = events.filter(row => row.type === 'eval-result');
  const comparisons = ['number', 'text'].flatMap(family => ['frozen', 'permuted'].map(control => comparison(rows, { family, control })));
  const learned = rows.filter(row => row.arm === 'learned');
  const known = learned.filter(row => row.score.solvable);
  const unknown = learned.filter(row => !row.score.solvable);
  const unknownRate = unknown.filter(row => row.score.unknownRecognized).length / unknown.length;
  const brier = known.reduce((sum, row) => sum + row.score.brier, 0) / known.length;
  const windows = Array.from({ length: protocol.evaluationWindows }, (_, window) => {
    const subset = known.filter(row => row.window === window);
    return { window, successRate: subset.filter(row => row.score.exact).length / subset.length };
  });
  return { comparisons, unknownRate, brier, windows,
    passed: comparisons.every(row => row.passed) && unknownRate >= protocol.minimumUnknownRecognition
      && brier <= protocol.maximumBrier && windows.every(row => row.successRate >= 0.8) };
}

module.exports = { valid, identity, answer, wilsonLower, identitySummary, learningSummary };
