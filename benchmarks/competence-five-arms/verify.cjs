'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const corpus = require('./corpus.cjs');
const protocol = require('./protocol.json');
const methods = require('./methods.cjs');
const llm = require('./llm.cjs');
const evidence = require('./evidence.cjs');
const analysis = require('./analysis.cjs');

function journal(directory) {
  const rows = fs.readFileSync(path.join(directory, 'events.jsonl'), 'utf8').trim().split(/\r?\n/).map(JSON.parse);
  let previous = null;
  for (const [index, row] of rows.entries()) {
    const { hash, ...payload } = row;
    assert.equal(payload.index, index);
    assert.equal(payload.previous, previous);
    assert.equal(hash, corpus.hash(payload));
    previous = hash;
  }
  return rows;
}

function checkModel(row) {
  if (row.arm === 'synthesis_only') return assert.equal(row.model, null);
  assert.ok(row.model);
  let value = null;
  try { value = JSON.parse(row.model.raw); } catch (_) { /* Invalid outputs remain failures. */ }
  assert.deepEqual(row.model.value, value);
  assert.equal(row.model.valid, methods.valid(value));
  assert.equal(row.budgetVerified, llm.withinBudget(row.model));
}

function checkRow(row, context) {
  const history = corpus.observations(context.world).slice(0, row.checkpoint);
  const query = corpus.queries(context.world, row.checkpoint).find(item => item.id === row.query.id);
  assert.deepEqual(row.query, query);
  const observations = row.arm === 'raw_history' ? history : corpus.relevant(history, query);
  const expected = row.arm === 'no_memory' ? [] : observations;
  assert.deepEqual(row.payload.observations, methods.publicRows(expected));
  assert.deepEqual(row.payload.query, { id: query.id, expression: query.expression, epochs: query.epochs });
  const tool = methods.tool(history, query);
  if (row.arm === 'hybrid') assert.deepEqual(row.payload.affineTool, tool);
  checkModel(row);
  assert.deepEqual(row.response, methods.finalize({ arm: row.arm, model: row.model, tool }));
  assert.deepEqual(row.oracle, context.labels.get(query.id));
}

function checkCheckpoints(events, manifest) {
  const checkpoints = events.filter(row => row.type === 'checkpoint');
  assert.equal(checkpoints.length, protocol.worlds * protocol.checkpoints.length);
  const identities = new Set();
  for (const event of checkpoints) {
    const world = manifest.worlds[event.world];
    const history = corpus.observations(world).slice(0, event.checkpoint);
    assert.deepEqual(event.state, { count: event.checkpoint, observationHash: corpus.hash(history) });
    assert.deepEqual(event.restored, event.state);
    const queries = corpus.queries(world, event.checkpoint);
    const outcomes = evidence.oracle({ world, queries, history });
    const labels = new Map(queries.map((query, i) => [query.id, outcomes[i]]));
    assert.equal(event.rows.length, protocol.queriesPerCheckpoint * protocol.arms.length);
    for (const row of event.rows) {
      const identity = [row.world, row.checkpoint, row.query.id, row.arm].join(':');
      assert.ok(!identities.has(identity));
      identities.add(identity);
      checkRow(row, { world, labels });
    }
  }
  return checkpoints.flatMap(row => row.rows);
}

function verify(directory, expectedHash) {
  const read = name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
  const manifest = read('manifest.json');
  assert.equal(corpus.hash(manifest), expectedHash);
  assert.deepEqual(manifest.protocol, protocol);
  assert.deepEqual(manifest.provenance.sources, evidence.sourceHashes());
  for (const [name, hash] of Object.entries(manifest.provenance.sources)) {
    assert.equal(corpus.hash(fs.readFileSync(path.join(directory, 'sources', name), 'utf8')), hash);
  }
  manifest.worlds.forEach(world => assert.deepEqual(world, corpus.world(world.seed)));
  const events = journal(directory);
  assert.equal(events[0].manifestHash, expectedHash);
  const rows = checkCheckpoints(events, manifest);
  assert.deepEqual(rows, read('measurements.json'));
  const report = read('report.json');
  const computed = analysis.report(rows);
  for (const key of Object.keys(computed)) assert.deepEqual(report[key], computed[key]);
  const predictions = events.filter(row => row.type === 'prediction').map(row => row.row);
  assert.deepEqual(predictions, rows.map(({ oracle, ...row }) => row));
  const training = events.filter(row => row.type === 'training_observation');
  assert.equal(training.length, protocol.worlds * 100);
  assert.equal(rows.filter(row => row.model).length, protocol.maximumCalls);
  assert.equal(events.at(-1).reportHash, corpus.hash(report));
  assert.equal(events.at(-1).measurementsHash, corpus.hash(rows));
  return { verified: true, predictions: rows.length, modelCalls: report.modelCalls,
    contrasts: computed.contrasts, conclusion: report.conclusion,
    limitation: 'Archive and mathematical replay, not a new inference or independent laboratory.' };
}

if (require.main === module) {
  try { console.log(JSON.stringify(verify(process.argv[2], process.argv[3]), null, 2)); }
  catch (error) { console.error(error.stack); process.exitCode = 1; }
}
module.exports = { verify, journal };
