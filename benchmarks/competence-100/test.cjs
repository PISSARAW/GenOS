'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const corpus = require('./corpus.cjs');
const oracle = require('./oracle.cjs');
const agent = require('./agent.cjs');
const statistics = require('./statistics.cjs');
const evidence = require('./evidence.cjs');
const verifier = require('./verify.cjs');
const protocol = require('./protocol.json');
const inference = require('./inference.cjs');
const standalone = require('./llamacpp.cjs');
const SEEDS = { world: 'unit-world-excluded-from-live', test: 'unit-test-only', order: 'unit-order' };

test('100 distinct training problems; disjoint holdout with new composition and unknown operators', () => {
  const generated = corpus.generate(SEEDS);
  assert.deepEqual(generated, corpus.generate(SEEDS));
  assert.equal(generated.training.length, 100);
  assert.equal(new Set(generated.training.map(task => task.id)).size, 100);
  assert.equal(generated.heldout.length, 160);
  const train = new Set(generated.training.map(task => task.id));
  assert.ok(generated.heldout.every(task => !train.has(task.id)));
  assert.ok(generated.training.every(task => corpus.operators(task.expression).length === 1));
  assert.ok(generated.heldout.filter(task => task.family === 'new_composition')
    .every(task => corpus.operators(task.expression).length === 2));
});

test('unknown operators cannot earn numeric correctness; ignorance requires naming the gap', () => {
  const generated = corpus.generate(SEEDS);
  const task = generated.heldout.find(task => task.family === 'insufficient_information');
  const input = { task, world: generated.world, known: Object.keys(generated.world).slice(0, 4) };
  const numeric = oracle.assess({ ...input, response: { answer: 0, abstain: false, missing: [] } });
  assert.equal(numeric.numericCorrect, false);
  const abstain = { answer: null, abstain: true, missing: numeric.missing };
  assert.equal(oracle.assess({ ...input, response: abstain }).recognized, true);
  assert.equal(oracle.assess({ ...input, response: { ...abstain, missing: [] } }).recognized, false);
});

test('bounds handle empty data, exact binomial endpoints and conservative paired gains', () => {
  assert.equal(statistics.pairedBound([]).lower, null);
  assert.equal(statistics.binomialBounds(0, 40).lower, 0);
  assert.ok(Math.abs(statistics.binomialBounds(40, 40).lower
    - (protocol.familywiseAlpha / protocol.simultaneousBounds) ** (1 / 40)) < 1e-10);
  assert.ok(Math.abs(statistics.binomialBounds(0, 40).upper
    - (1 - (protocol.familywiseAlpha / protocol.simultaneousBounds) ** (1 / 40))) < 1e-10);
  assert.equal(statistics.binomialBounds(20, 40).rate, 0.5);
  assert.ok(statistics.pairedBound(Array(60).fill(1)).lower > 0.1);
  assert.ok(statistics.pairedBound(Array(60).fill(0)).lower < 0.1);
});

test('universal abstention, invalid responses and missing comparisons cannot demonstrate improvement', () => {
  const row = { valid: true, response: { answer: null, confidence: 0 }, decision: { abstain: true },
    oracle: { answerable: true, numericCorrect: false } };
  const metrics = statistics.metrics(Array(120).fill(row));
  assert.equal(metrics.knownSuccess, 0);
  assert.equal(metrics.brier, 0);
  assert.equal(metrics.knownCoverage, 0);
  assert.equal(statistics.metrics([{ ...row, valid: false }]).calibrationCoverage, 0);
  const byArm = Object.fromEntries(protocol.arms.map(arm => [arm, metrics]));
  const result = statistics.conclusion({ byArm, transfer: statistics.comparisons([]), integrity: { passed: true } });
  assert.equal(result.status, 'not_demonstrated');
  assert.equal(result.gates.transfer, false);
  assert.equal(result.gates.usefulCoverage, false);
  assert.equal(result.authorizesPromotion, false);
});

test('actual GenOS memory persists across reconnection and reset remains empty', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'competence-100-test-'));
  const filename = path.join(directory, 'agent.db');
  const generated = corpus.generate(SEEDS);
  let db = await agent.connect(filename);
  for (const task of generated.training) {
    await agent.learn(db, { task, expected: oracle.evaluate(task.expression, generated.world), oracleEvent: 'unit-test' });
  }
  const before = await agent.stateHash(db);
  await db.close();
  db = await agent.connect(filename);
  try {
    assert.equal(await agent.stateHash(db), before);
    const task = generated.heldout.find(task => task.family === 'new_composition');
    const examples = await agent.recall(db, task.expression);
    assert.ok(examples.length >= 3 && examples.length <= 6);
    assert.ok(examples.every(example => generated.training.some(item => item.id === corpus.hash(example.expression))));
    const reset = await agent.connect(':memory:');
    try { assert.deepEqual(await agent.recall(reset, task.expression), []); }
    finally { await reset.close(); }
  } finally {
    await db.close();
    assert.equal(path.dirname(fs.realpathSync(directory)), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('competence-100-test-'));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('journal rejects tampering; external manifest hash is mandatory', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'competence-100-test-'));
  try {
    const append = evidence.journal(directory);
    append({ type: 'manifest', manifestHash: 'test' });
    append({ type: 'response', result: { confidence: 0.2 } });
    assert.equal(evidence.readJournal(directory).length, 2);
    const filename = path.join(directory, 'events.jsonl');
    fs.writeFileSync(filename, fs.readFileSync(filename, 'utf8').replace('0.2', '0.9'));
    assert.throws(() => evidence.readJournal(directory), /chain mismatch/);
    assert.throws(() => verifier.verify(directory), /externally retained/);
  } finally {
    assert.equal(path.dirname(fs.realpathSync(directory)), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('competence-100-test-'));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('probabilities are never coerced; production policy can veto an overconfident answer', () => {
  const valid = { answer: 1, confidence: 0.9, abstain: false, missing: [] };
  assert.equal(agent.validResponse(valid), true);
  assert.equal(agent.validResponse({ ...valid, confidence: '0.9' }), false);
  assert.equal(agent.validResponse({ ...valid, confidence: 1.1 }), false);
  assert.equal(agent.decision({ ...valid, confidence: 0.1 }).abstain, true);
});

test('bounded support requires all gates, retains negative results and never means general competence', () => {
  const strong = { knownCoverage: 1, brier: 0.01, calibrationCoverage: 1,
    unknownRecognition: statistics.binomialBounds(40, 40),
    unknownHighConfidenceError: statistics.binomialBounds(0, 40) };
  const byArm = { initial: { ...strong, brier: 0 }, experienced: strong, reset: { ...strong, brier: 0 } };
  const transfer = Array.from({ length: 4 }, () => statistics.pairedBound(Array(60).fill(1)));
  const integrity = { intact: true };
  const supported = statistics.conclusion({ byArm, transfer, integrity });
  assert.equal(supported.status, 'bounded_support');
  assert.equal(supported.generalCompetenceDemonstrated, false);
  assert.equal(statistics.conclusion({ byArm, transfer, integrity: { intact: false } }).status, 'not_demonstrated');
  byArm.experienced = { ...strong, brier: 0.3 };
  assert.equal(statistics.conclusion({ byArm, transfer, integrity }).status, 'not_demonstrated');
});

test('an installed model with a broken executor is rejected before a campaign is created', async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 500, text: async () => '{"error":"llama-server binary not found"}' });
  try {
    await assert.rejects(inference.requireReady({ name: 'unit-model' }), /INFERENCE_UNAVAILABLE.*llama-server binary not found/);
  } finally { global.fetch = previousFetch; }
});

test('standalone transport is local and preserves real token counts and raw output', async () => {
  assert.throws(() => standalone.localEndpoint('https://example.com'), /127.0.0.1/);
  assert.throws(() => standalone.localEndpoint('http://user:password@127.0.0.1:11435'), /127.0.0.1/);
  const previousFetch = global.fetch;
  const expected = { answer: 17, confidence: 0.8, abstain: false, missing: [] };
  global.fetch = async (url, options) => {
    const request = JSON.parse(options.body);
    assert.equal(request.max_tokens, 128);
    assert.equal(request.cache_prompt, false);
    return { ok: true, json: async () => ({ model: 'unit-model', usage: { prompt_tokens: 81, completion_tokens: 32 },
      choices: [{ message: { content: JSON.stringify(expected) }, finish_reason: 'stop' }] }) };
  };
  try {
    const result = await standalone.complete({ model: { name: 'unit-model', endpoint: 'http://127.0.0.1:11435' },
      timeoutMs: 1000, maxTokens: 128, seed: 1, messages: [] });
    assert.deepEqual(JSON.parse(result.raw), expected);
    assert.equal(result.inputTokens, 81);
    assert.equal(result.outputTokens, 32);
  } finally { global.fetch = previousFetch; }
});
