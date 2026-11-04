'use strict';

const protocol = require('./protocol.json');
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const accepted = row => row.response.valid && !row.response.abstain;
const exact = row => accepted(row) && row.oracle.identifiable && row.response.answer === row.oracle.expected;
const numerical = row => ['new_input', 'composition'].includes(row.query.family);

function recognized(row) {
  if (!row.response.valid || !row.response.abstain || row.response.reason !== row.oracle.reason) return false;
  return row.oracle.missing.every(op => row.response.missing.includes(op));
}

function metrics(rows) {
  const known = rows.filter(row => row.oracle.identifiable);
  const unknown = rows.filter(row => !row.oracle.identifiable);
  const target = rows.filter(numerical);
  const answered = rows.filter(accepted);
  const successes = rows.filter(exact);
  const confidence = row => row.response.abstain ? 0 : row.response.confidence;
  return { assigned: rows.length, valid: rows.filter(row => row.response.valid).length,
    fixedNumericalTasks: target.length, usefulExact: target.filter(exact).length,
    usefulRate: mean(target.map(row => Number(exact(row)))),
    identifiable: known.length, covered: known.filter(accepted).length,
    selectiveAccuracy: answered.length ? successes.length / answered.length : null,
    unknown: unknown.length, recognized: unknown.filter(recognized).length,
    unsafeConfidence: unknown.filter(row => accepted(row) && row.response.confidence >= protocol.highConfidence).length,
    brier: mean(rows.map(row => (confidence(row) - Number(exact(row))) ** 2)),
    sources: Object.fromEntries([...new Set(rows.map(row => row.response.source))]
      .map(source => [source, rows.filter(row => row.response.source === source).length])) };
}

function signTest(differences) {
  const nonzero = differences.filter(value => Math.abs(value) > 1e-12);
  const positive = nonzero.filter(value => value > 0).length;
  let tail = 0;
  let combinations = 1;
  for (let k = 0; k <= nonzero.length; k++) {
    if (k >= positive) tail += combinations;
    combinations = combinations * (nonzero.length - k) / (k + 1);
  }
  return { meanGain: mean(differences), pOneSided: tail / 2 ** nonzero.length, worldDifferences: differences };
}

function contrasts(perWorld) {
  return protocol.primaryContrasts.map(([treatment, control]) => {
    const differences = Array.from({ length: protocol.worlds }, (_, world) => {
      const find = arm => perWorld.find(row => row.world === world && row.checkpoint === 100 && row.arm === arm).metrics.usefulRate;
      return find(treatment) - find(control);
    });
    const result = signTest(differences);
    return { treatment, control, ...result,
      supported: result.meanGain >= protocol.minimumPracticalGain && result.pOneSided <= protocol.alphaPerContrast };
  });
}

function report(rows) {
  const perWorld = [];
  const aggregated = [];
  for (const checkpoint of protocol.checkpoints) {
    for (const arm of protocol.arms) {
      const selected = rows.filter(row => row.checkpoint === checkpoint && row.arm === arm);
      aggregated.push({ checkpoint, arm, metrics: metrics(selected) });
      for (let world = 0; world < protocol.worlds; world++) {
        perWorld.push({ checkpoint, arm, world, metrics: metrics(selected.filter(row => row.world === world)) });
      }
    }
  }
  const final = rows.filter(row => row.checkpoint === 100);
  const byFamily = protocol.arms.flatMap(arm => [...new Set(final.map(row => row.query.family))]
    .map(family => ({ arm, family, metrics: metrics(final.filter(row => row.arm === arm && row.query.family === family)) } )));
  return { aggregated, perWorld, byFamily, contrasts: contrasts(perWorld) };
}

module.exports = { mean, accepted, exact, recognized, numerical, metrics, signTest, report };
