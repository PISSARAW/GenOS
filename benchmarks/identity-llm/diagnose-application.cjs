'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const corpus = require('./corpus.cjs');
const evidence = require('./evidence.cjs');
const scoring = require('./scoring.cjs');
const oracle = require('./oracle.cjs');
const engine = require('./engine.cjs');
const protocol = require('./config.cjs');

function definitions(w) {
  return Object.fromEntries(w.operations.filter(op => op.trained).map(op => [op.name,
    op.family === 'number' ? { kind: 'affine', a: op.a, b: op.b }
      : { kind: 'text', prefix: op.prefix, suffix: op.suffix, reverse: op.reverse, upper: op.upper }]));
}

function load(directory) {
  return { inference: require(path.join(directory, 'inference.cjs')),
    prompts: require(path.join(directory, 'prompts.cjs')), config: require(path.join(directory, 'config.cjs')) };
}

function results(rows, arm) {
  const own = rows.filter(row => row.arm === arm);
  const known = own.filter(row => row.score.solvable);
  const kinds = [...new Set(own.map(row => row.task.kind))];
  return { knownCorrect: known.filter(row => row.score.exact).length, knownTotal: known.length,
    unknownCorrect: own.filter(row => row.score.unknownRecognized).length,
    errors: own.filter(row => row.error).length,
    byKind: Object.fromEntries(kinds.map(kind => {
      const tasks = own.filter(row => row.task.kind === kind);
      return [kind, { correct: tasks.filter(row => row.score.solvable ? row.score.exact : row.score.unknownRecognized).length,
        total: tasks.length }];
    })) };
}

async function execute(input) {
  const { directory, w, variants, tasks } = input;
  const rows = [];
  const lessons = definitions(w);
  const deadline = Date.now() + 1800000;
  for (const task of tasks) {
    const order = Object.keys(variants).sort((a,b) => corpus.hash(task.id+a).localeCompare(corpus.hash(task.id+b)));
    for (const arm of order) {
      assert(Date.now() < deadline && rows.length < 80);
      const variant = variants[arm];
      const prompt = variant.prompts.taskPrompt('evaluate', { problem: task, lessons });
      const response = await variant.inference.attempt(prompt);
      require('./inference.cjs').log(directory, { type: 'response-committed', arm, prompt, response });
      const solvable = oracle.known(task.expression, w.operations);
      const checked = { taskId: task.id, solvable, expected: solvable ? oracle.evaluate(task.expression, w.operations) : null };
      const row = { type: 'development-result', arm, task, oracle: checked,
        score: scoring.answer(response, checked), error: response.error || !response.value };
      require('./inference.cjs').log(directory, row);
      rows.push(row);
      if (rows.length % 10 === 0) console.log('DEVELOPMENT_CALLS ' + rows.length + '/80');
    }
  }
  assert.equal(rows.length, 80);
  return rows;
}

function compatibility(variants) {
  for (const key of Object.keys(require('./baseline-criteria.json'))) {
    assert.deepEqual(variants.baseline.config[key], protocol[key], 'PROBE_CONDITION_CHANGED:' + key);
  }
  for (const key of ['modelAlias','modelBlob','endpoint']) assert.equal(variants.baseline.config[key], protocol[key]);
}

async function main(input) {
  const directory = path.resolve(input.directory);
  assert(!fs.existsSync(directory), 'OUTPUT_ALREADY_EXISTS');
  const variants = { baseline: load(path.resolve(input.baseline)), candidate: load(__dirname) };
  compatibility(variants);
  assert.equal(await evidence.fileHash(protocol.modelBlob), protocol.modelSha256, 'MODEL_BLOB_DIGEST_MISMATCH');
  fs.mkdirSync(directory, { recursive: true });
  const server = await engine.restart();
  try {
    const preflight = await require('./inference.cjs').ready();
    const seed = crypto.randomBytes(16).toString('hex');
    const w = corpus.world(seed);
    const tasks = corpus.tasks(w, { window: 0, counts: protocol.tasksPerWindow });
    const manifest = { developmentOnly: true, notEvidenceOfLearning: true, promotionAuthorized: false,
      description: 'Supplied correct definitions isolate application from learning. No test feedback or answer repair.',
      seed, tasks, lessons: definitions(w), server, preflight, maximumCalls: 80,
      baseline: path.resolve(input.baseline), provenance: evidence.provenance(),
      baselineSources: require(path.join(path.resolve(input.baseline), 'evidence.cjs')).sourceHashes(),
      startedAt: new Date().toISOString() };
    evidence.write(directory, 'manifest.json', manifest);
    console.log('DEVELOPMENT_MANIFEST ' + corpus.hash(manifest));
    const rows = await execute({ directory, w, variants, tasks });
    assert.deepEqual(evidence.sourceHashes(), manifest.provenance.sources);
    assert.deepEqual(require(path.join(path.resolve(input.baseline), 'evidence.cjs')).sourceHashes(), manifest.baselineSources);
    const report = { developmentOnly: true, notEvidenceOfLearning: true, calls: rows.length,
      completedAt: new Date().toISOString(),
      manifestHash: corpus.hash(manifest), results: Object.fromEntries(Object.keys(variants).map(arm => [arm, results(rows, arm)])) };
    evidence.write(directory, 'summary.json', report);
    console.log(JSON.stringify(report));
  } catch (error) {
    evidence.write(directory, 'failure.json', { error: error.stack, developmentOnly: true });
    throw error;
  } finally { await engine.stop(); }
}

if (require.main === module) main({ directory: process.argv[2], baseline: process.argv[3] })
  .catch(error => { console.error(error); process.exitCode = 1; });

module.exports = { main };
