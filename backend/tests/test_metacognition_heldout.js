'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= 'isolated-heldout-contract-tests';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const corpus = require('../../benchmarks/metacognition/heldout-corpus.cjs');
const oracle = require('../../benchmarks/metacognition/heldout-oracle.cjs');
const adapter = require('../../benchmarks/metacognition/ollama-adapter.cjs');
const verifier = require('../../benchmarks/metacognition/verify-heldout.cjs');
const fixture = require('./helpers/metacognitiveForecastFixture.cjs');
const bench = require('../src/services/metacognitionBenchService');
const { digest } = require('../src/services/biologicalIntegrity');

function sign(report, keys) {
  return { report, hash: digest(report), signature: crypto.sign(null, Buffer.from(JSON.stringify(report)), keys.privateKey).toString('base64') };
}

function groups(rows) {
  return Object.fromEntries(corpus.DOMAINS.map(domain => {
    const selected = rows.filter(row => row.domain === domain);
    return [domain, { resolved: selected.length, successes: selected.filter(row => row.oracle.correct).length,
      brier: selected.reduce((sum, row) => sum + (0.8 - Number(row.oracle.correct)) ** 2, 0) / selected.length }];
  }));
}

async function archiveFixture(keys) {
  const db = await fixture.createDb();
  const cases = corpus.SEEDS.flatMap(seed => corpus.corpus(seed));
  const manifest = { sealedAt: new Date().toISOString(), corpusHash: corpus.hash(cases),
    publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }),
    protocol: { seeds: corpus.SEEDS, domains: corpus.DOMAINS, developmentSeed: corpus.DEVELOPMENT_SEED,
      perDomain: 2, maxCalls: 36, maxOutputTokens: 3456, maxDurationMs: 300000 } };
  const measurements = [];
  try {
    for (const [index, item] of cases.entries()) {
      const saved = await fixture.capture(db, item.caseId, 0.8);
      const observed = oracle.evaluate({ problem: item, answer: oracle.expected(item) + index % 2 });
      const resolved = await fixture.resolve(db, item.caseId, observed.correct);
      measurements.push({ caseId: item.caseId, domain: item.domain, seed: item.seed, status: 'resolved',
        forecast: saved.forecast, oracle: observed, resolution: resolved.event });
    }
    return sign({ manifest, measurements, groups: groups(measurements), calibration: await bench.runBench(db, 'agent', {}),
      coverage: 1, accounting: { calls: 36, outputTokens: 300, elapsedMs: 100 }, status: 'measured_local_holdout',
      officialBenchmarks: { SAD: 'not_run', MIRROR: 'not_run' }, promotionAllowed: false }, keys);
  } finally { await db.close(); }
}

async function providerContracts() {
  const fetchOriginal = global.fetch;
  try {
    global.fetch = async () => { throw Error('offline'); };
    await assert.rejects(adapter.describe('test:local'), /offline/);
    await assert.rejects(adapter.describe('test:cloud'), /local models only/);
    global.fetch = async () => ({ ok: true, json: async () => ({ models: [] }) });
    await assert.rejects(adapter.describe('missing:local'), /unavailable/);
    global.fetch = async (url, options) => {
      assert.equal(url, 'http://127.0.0.1:11434/api/chat');
      const body = JSON.parse(options.body);
      assert.equal(body.options.num_predict, 96);
      assert.equal(body.options.temperature, 0);
      assert.equal(body.stream, false);
      assert.equal(body.messages[1].content, 'task without answer or outcome');
      return { ok: true, json: async () => ({ message: { content: '{"probability":0.8}' }, eval_count: 8 }) };
    };
    assert.equal((await adapter.request({ model: 'test:local', instruction: 'forecast only',
      prompt: 'task without answer or outcome', seed: 4, timeoutMs: 1000 })).value.probability, 0.8);
  } finally { global.fetch = fetchOriginal; }
}

async function main() {
  const dev = corpus.corpus(corpus.DEVELOPMENT_SEED);
  const heldout = corpus.SEEDS.flatMap(seed => corpus.corpus(seed));
  assert.equal(heldout.length, 18);
  assert.equal(new Set(heldout.map(item => item.caseId)).size, 18);
  const devPrompts = new Set(dev.map(item => item.prompt));
  assert.ok(heldout.filter(item => item.domain !== 'logic').every(item => !devPrompts.has(item.prompt)));
  assert.ok(heldout.every(item => !Object.hasOwn(item, 'answer') && !Object.hasOwn(item, 'correct')));
  for (const p of [false, true]) for (const q of [false, true]) for (const r of [false, true]) {
    assert.equal(oracle.expected({ domain: 'logic', values: [p, q, r] }), Number((p && !q) || (r && q)));
  }
  const keys = crypto.generateKeyPairSync('ed25519');
  const archive = await archiveFixture(keys);
  assert.equal(verifier.verifyArchive(archive, archive.hash).coverage, 1);
  assert.throws(() => verifier.verifyArchive(archive, 'foreign'), /Pinned/);
  assert.throws(() => verifier.verifyArchive({ ...archive, signature: Buffer.alloc(64).toString('base64') }), /signature/);
  const fakeMetrics = structuredClone(archive.report);
  fakeMetrics.calibration.brier = 0;
  assert.throws(() => verifier.verifyArchive(sign(fakeMetrics, keys)), /metric/);
  const fakeOracle = structuredClone(archive.report);
  fakeOracle.measurements[0].oracle.correct = false;
  assert.throws(() => verifier.verifyArchive(sign(fakeOracle, keys)), /Oracle/);
  const omitted = structuredClone(archive.report);
  omitted.measurements.pop();
  assert.throws(() => verifier.verifyArchive(sign(omitted, keys)), /Missing/);
  await providerContracts();
  console.log('Heldout contract: oracle, immutable prior integration, coverage, signed archive, forged metrics and provider failures PASS.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
