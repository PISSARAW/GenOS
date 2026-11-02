'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const protocol = require('./protocol.json');
const corpus = require('./corpus.cjs');
const oracle = require('./oracle.cjs');
const runtime = require('./runtime.cjs');
const scoring = require('./scoring.cjs');
const prompts = require('./prompts.cjs');
const evidence = require('./evidence.cjs');
const inference = require('./inference.cjs');

function corpusChecks(w) {
  const training = Array.from({ length: protocol.cyclesPerLineage }, (_, index) => corpus.training(w, index));
  const tasks = corpus.tasks(w, { window: 0, counts: protocol.tasksPerWindow });
  const ids = new Set(training.map(task => task.id));
  assert(tasks.every(task => !ids.has(task.id)));
  assert.equal(tasks.filter(task => task.kind === 'unknown').length, 8);
  for (const task of training) assert.equal(oracle.known(task.expression, w.operations), true);
  for (const task of tasks.filter(task => task.kind === 'unknown')) assert.equal(oracle.known(task.expression, w.operations), false);
  assert.equal(corpus.relation(w, w.actors[0], w.actors[5]), 'descendant');
  assert.equal(corpus.relation(w, w.actors[5], w.actors[0]), 'ancestor');
  assert.equal(corpus.relation(w, w.actors[0], w.actors[6]), 'unrelated');
}

function identityChecks() {
  const good = { self: true, origin: true, path: true, relation: true, author: true, ownership: true };
  const events = Array.from({ length: 300 }, () => ({ type: 'train-result', identity: { ...good } }));
  events.push({ type: 'clone-result', identity: { ...good } });
  assert.equal(scoring.identitySummary(events).passed, true);
  for (let index = 0; index < 10; index++) events[index].identity.self = false;
  assert.equal(scoring.identitySummary(events).passed, false);
  assert.equal(scoring.answer({ value: { answer: null, confidence: 1 } }, { expected: null, solvable: false }).unknownRecognized, false);
  assert.equal(scoring.answer({ value: null }, { expected: 0, solvable: true }).exact, false);
}

function learningChecks(w) {
  const events = [];
  for (let window = 0; window < protocol.evaluationWindows; window++) {
    for (const task of corpus.tasks(w, { window, counts: protocol.tasksPerWindow })) {
      for (const arm of protocol.arms) {
        const solvable = task.kind !== 'unknown';
        events.push({ type: 'eval-result', window, task, arm, score: {
          solvable, exact: arm === 'learned', unknownRecognized: !solvable, brier: 0 } });
      }
    }
  }
  assert.equal(scoring.learningSummary(events).passed, true);
  for (const event of events.filter(row => row.arm === 'learned')) event.score.exact = false;
  assert.equal(scoring.learningSummary(events).passed, false);
}

async function durableChecks(directory, w) {
  const filename = path.join(directory, 'unit.sqlite');
  let db = await runtime.open(filename);
  try {
    await runtime.initialize(db, w);
    const actor = w.actors[0];
    const session = await runtime.activate(db, actor);
    await runtime.transform(db, { agentId: actor, cycle: 0 });
    await runtime.decisions.begin(db, { session, operationId: 'worker:unit', domain: 'unit', dimensions: ['continuity'] });
    await runtime.decisions.finish(db, { session, operationId: 'worker:unit', success: true,
      attribution: 'self', evidenceRef: 'unit-fixture-only-not-real-inference' });
    const episode = await runtime.ownEpisode(db, { id: 'episode:unit', actor, operationId: 'unit' });
    assert.equal(episode.provenance.evidenceClass, 'runtime_attested_decision');
    const copy = await runtime.inherit(db, { id: 'inherited:unit', actor: w.actors[5], sourceId: episode.id });
    assert.equal(copy.provenance.experiencedBy, actor);
    assert.equal(copy.provenance.kind, 'inherited');
    await runtime.save(db, { id: 'memory:unit', agentId: actor, kind: 'preference',
      value: { origin: w.origin }, provenance: { ordinal: 0, status: 'unit-fixture' } });
    const before = await runtime.state(db, actor);
    await runtime.incarnations.release(db, session);
    await db.close();
    db = await runtime.open(filename);
    assert.deepEqual(await runtime.state(db, actor), before);
    for (const id of w.actors) assert.equal((await runtime.ledger.verify(db, id)).valid, true);
  } finally { await db.close(); }
}

function journalChecks(directory) {
  inference.log(directory, { type: 'unit-check', value: 1 });
  inference.log(directory, { type: 'unit-check', value: 2 });
  assert.equal(evidence.journal(directory).length, 2);
  const file = path.join(directory, 'events.jsonl');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('"value":1', '"value":3'));
  assert.throws(() => evidence.journal(directory), /CHAIN_BROKEN/);
}

async function main() {
  const parent = 'D:/GenOS-runs/identity-llm/unit-tests';
  fs.mkdirSync(parent, { recursive: true });
  const directory = fs.mkdtempSync(path.join(parent, 'case-'));
  const w = corpus.world('unit-only-not-a-campaign-seed');
  corpusChecks(w);
  identityChecks();
  learningChecks(w);
  assert.equal(prompts.validUpdate({ op: 'x', rule: 'rule' }, { op: 'y' }), false);
  await durableChecks(directory, w);
  journalChecks(directory);
  console.log('PASS unit tests: corpus, provenance, durable memory, score falsification, journal tampering. No LLM campaign simulated as evidence.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
