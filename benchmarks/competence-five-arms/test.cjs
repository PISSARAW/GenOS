'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const corpus = require('./corpus.cjs');
const oracle = require('./oracle.cjs');
const methods = require('./methods.cjs');
const memory = require('./memory.cjs');
const evidence = require('./evidence.cjs');
const analysis = require('./analysis.cjs');
const protocol = require('./protocol.json');
const world = corpus.world('unit-world-not-experimental');

test('Public class contains every generated true rule and no training/query overlap', () => {
  assert.equal(corpus.candidates().length, 735);
  const history = corpus.observations(world);
  for (const checkpoint of protocol.checkpoints) {
    const queries = corpus.queries(world, checkpoint);
    assert.equal(queries.length, 12);
    assert.ok(queries.every(query => JSON.stringify(query.expression).includes('op_')));
    assert.ok(queries.every(query => !history.some(row => row.x >= 100)));
  }
  const all = protocol.checkpoints.flatMap(checkpoint => corpus.queries(world, checkpoint).map(row => row.id));
  assert.equal(new Set(all).size, all.length);
});

test('Oracle distinguishes extrapolation ambiguity from missing definitions', () => {
  const query = corpus.queries(world, 16)[0];
  const ambiguous = oracle.assess({ world, query, history: corpus.observations(world).slice(0, 16) });
  assert.equal(ambiguous.identifiable, false);
  assert.equal(ambiguous.reason, 'ambiguous');
  const identified = oracle.assess({ world, query, history: corpus.observations(world).slice(0, 40) });
  assert.equal(identified.identifiable, true);
  const missing = oracle.assess({ world, query, history: [] });
  assert.equal(missing.reason, 'missing');
});

test('One repeatedly observed point remains ambiguous after 100 experiences', () => {
  const query = corpus.queries(world, 100)[8];
  const result = oracle.assess({ world, query, history: corpus.observations(world) });
  assert.equal(result.identifiable, false);
  assert.equal(result.reason, 'ambiguous');
  assert.deepEqual(result.missing, []);
});

test('Epoch change cannot reuse a previous rule as current evidence', () => {
  const history = corpus.observations(world);
  const query = corpus.queries(world, 64)[3];
  const recalled = corpus.relevant(history.slice(0, 64), query);
  assert.equal(recalled.length, 1);
  assert.equal(recalled[0].epoch, 1);
  assert.equal(methods.tool(history.slice(0, 64), query).abstain, true);
  assert.equal(oracle.assess({ world, query, history: history.slice(0, 64) }).identifiable, false);
});

test('Affine synthesis is deliberately insufficient for a verified nonlinear operator', () => {
  const history = corpus.observations(world).slice(0, 40);
  const query = corpus.queries(world, 40)[2];
  assert.equal(methods.tool(history, query).abstain, true);
  assert.equal(oracle.assess({ world, query, history }).identifiable, true);
});

test('Actual production memory persists provenance and restores in another process', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'five-arm-unit-'));
  const filename = path.join(directory, 'agent.sqlite');
  const db = await memory.connect(filename);
  try {
    for (const observation of corpus.observations(world).slice(0, 4)) {
      await memory.ingest(db, { worldId: 'unit', observation, eventHash: 'unit-evidence' });
    }
    const checkpoint = await memory.checkpoint(db, 'unit');
    assert.deepEqual(evidence.restored(filename, 'unit'), checkpoint);
    const entry = await db.get('SELECT provenance_json FROM ontogenesis_memory LIMIT 1');
    assert.equal(JSON.parse(entry.provenance_json).eventHash, 'unit-evidence');
  } finally { await db.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});

test('Raw history payload is frozen and does not acquire future training examples', async () => {
  const history = corpus.observations(world).slice(0, 4);
  const context = await methods.context({ arm: 'raw_history' }, { history });
  history.push(corpus.observations(world)[4]);
  assert.equal(context.observations.length, 4);
});

test('Invalid model output is a failed recognition, not a successful abstention', () => {
  const response = methods.finalize({ arm: 'genos_memory', model: { valid: false } });
  const row = { response, query: { family: 'missing' }, oracle: { identifiable: false, reason: 'missing', missing: ['op_x'] } };
  assert.equal(analysis.recognized(row), false);
  assert.equal(analysis.metrics([row]).valid, 0);
});

test('Primary contrasts use worlds, not repeated query rows, as replication units', () => {
  const result = analysis.signTest([1, 1, 1, 1, 1, 1]);
  assert.equal(result.pOneSided, 1 / 64);
  assert.equal(result.meanGain, 1);
  assert.equal(analysis.signTest([0, 0, 0, 0, 0, 0]).pOneSided, 1);
});
