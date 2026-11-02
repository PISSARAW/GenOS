'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const corpus = require('./corpus.cjs');
const agent = require('./agent.cjs');
const oracle = require('./oracle.cjs');
const evidence = require('./evidence.cjs');
const statistics = require('./statistics.cjs');
const inference = require('./inference.cjs');
const protocol = require('./protocol.json');

function expectedExamples(task, learned) {
  const ops = new Set(corpus.operators(task.expression));
  const counts = {};
  return learned.filter(example => {
    const op = example.expression.op;
    if (!ops.has(op)) return false;
    counts[op] = (counts[op] || 0) + 1;
    return counts[op] <= protocol.memoryExamplesPerOperator;
  });
}

function checkSchedule(manifest, rows) {
  const train = rows.filter(row => row.phase === 'training');
  assert.equal(train.length, protocol.trainingExperiences, 'Exactly 100 training experiences required');
  assert.deepEqual(rows.slice(0, 100), train, 'Training must precede heldout');
  assert.deepEqual(train.map(row => row.taskId), manifest.corpus.training.map(task => task.id));
  const next = corpus.random(manifest.seeds.order);
  const expected = manifest.corpus.heldout.flatMap(task => corpus.shuffle(protocol.arms, next)
    .map(arm => [task.id, arm]));
  assert.deepEqual(rows.slice(100).map(row => [row.taskId, row.arm]), expected);
}

function checkRows(manifest, input) {
  const { rows, events } = input;
  const tasks = new Map([...manifest.corpus.training, ...manifest.corpus.heldout].map(task => [task.id, task]));
  const lookup = new Map(events.map(event => [event.hash, event]));
  const learned = [];
  for (const row of rows) {
    const task = tasks.get(row.taskId);
    assert.ok(task, 'Unknown task');
    const responseEvent = lookup.get(row.responseEvent);
    const oracleEvent = lookup.get(row.oracleEvent);
    verifyEvents(row, { responseEvent, oracleEvent, task });
    assert.equal(row.modelBudgetVerified, inference.withinBudget(responseEvent.result, manifest.model));
    const expected = row.arm === 'experienced' ? expectedExamples(task, learned) : [];
    assert.equal(responseEvent.prompt, agent.prompt(task, expected), 'Prompt leakage or altered memory');
    assert.deepEqual(row.decision, agent.decision(row.response));
    assert.deepEqual(row.oracle, oracle.assess({ task, response: row.response,
      world: manifest.corpus.world, known: Object.keys(manifest.corpus.world).slice(0, 4) }));
    if (row.phase === 'training') learned.push({ expression: task.expression, answer: row.oracle.expected });
  }
}

function verifyEvents(row, input) {
  const { responseEvent, oracleEvent, task } = input;
  assert.equal(responseEvent.type, 'response');
  assert.equal(oracleEvent.type, 'oracle');
  assert.equal(responseEvent.index + 1, oracleEvent.index, 'Oracle must follow committed response');
  assert.equal(oracleEvent.responseEvent, row.responseEvent);
  assert.equal(responseEvent.taskId, row.taskId);
  assert.equal(responseEvent.arm, row.arm);
  assert.equal(responseEvent.phase, row.phase);
  assert.equal(row.family, task.family);
  assert.equal(row.valid, agent.validResponse(responseEvent.result.value));
  if (row.valid) assert.deepEqual(row.response, responseEvent.result.value);
  assert.deepEqual(row.oracle, oracleEvent.measured);
}

function checkReport(report, rows) {
  const test = rows.filter(row => row.phase === 'heldout');
  const byArm = Object.fromEntries(protocol.arms.map(arm => [arm, statistics.metrics(test.filter(row => row.arm === arm))]));
  const transfer = statistics.comparisons(test);
  assert.deepEqual(report.byArm, byArm);
  assert.deepEqual(report.transfer, transfer);
  assert.equal(report.integrity.exactly100Experiences, rows.filter(row => row.phase === 'training').length === 100);
  assert.equal(report.integrity.completeAssignment, rows.length === protocol.maximumCalls);
  assert.equal(report.integrity.budgetsVerified, rows.every(row => row.modelBudgetVerified));
  assert.deepEqual(report.conclusion, statistics.conclusion({ byArm, transfer, integrity: report.integrity }));
}

function verify(directory, expectedHash) {
  if (!/^[a-f0-9]{64}$/.test(expectedHash || '')) throw Error('An externally retained manifest hash is required');
  const read = name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
  const manifest = read('manifest.json');
  const rows = read('measurements.json');
  const report = read('report.json');
  assert.equal(corpus.hash(manifest), expectedHash, 'Manifest seal mismatch');
  assert.equal(report.manifestHash, expectedHash);
  assert.deepEqual(manifest.protocol, protocol, 'Protocol version mismatch');
  assert.deepEqual(manifest.corpus, corpus.generate(manifest.seeds));
  assert.deepEqual(manifest.provenance.sources, evidence.sourceHashes(), 'Source drift');
  const events = evidence.readJournal(directory);
  assert.equal(events[0].manifestHash, expectedHash);
  assert.equal(events.at(-1).reportHash, corpus.hash(report));
  assert.equal(events.at(-1).rowsHash, corpus.hash(rows));
  assert.equal(rows.length, protocol.maximumCalls);
  assert.equal(events.filter(event => event.type === 'response').length, rows.length);
  assert.equal(events.filter(event => event.type === 'oracle').length, rows.length);
  checkSchedule(manifest, rows);
  checkRows(manifest, { rows, events });
  checkReport(report, rows);
  return { verified: true, manifestHash: expectedHash, conclusion: report.conclusion,
    limitation: 'Local integrity and score replay; not independent attestation of runtime, model weights or experimenter honesty.' };
}

if (require.main === module) {
  try { console.log(JSON.stringify(verify(process.argv[2], process.argv[3]), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { verify, checkSchedule, checkRows, checkReport };
