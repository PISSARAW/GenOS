'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const corpus = require('../competence-five-arms/corpus.cjs');
const protocol = require('./protocol.json');
const evidence = require('./evidence.cjs');
const llm = require('./llm.cjs');
const inference = require('./inference.cjs');
const executor = require('./executor.cjs');
const contracts = require('./contracts.cjs');
const presentation = require('./presentation.cjs');

function reference(node, programs) {
  if (typeof node === 'number') return node;
  const x = reference(node.value, programs);
  const rule = programs.find(item => item.op === node.op);
  if (rule.kind === 'quadratic') return rule.a * x ** 2 + rule.b * x + rule.c;
  if (rule.kind === 'hinge') return rule.a * x + rule.b + rule.c * (x > 5 ? x - 5 : 0);
  return rule.a * x + rule.b;
}

function program(input, next) {
  return { op: input.op, epoch: input.epoch, kind: input.kind,
    a: 1 + next(3), b: next(7) - 3, c: input.kind === 'affine' ? 0 : 1 + next(2) };
}

function cases(input) {
  const next = corpus.random(input.seed);
  const count = input.mode === 'development' ? 8 : 16;
  return Array.from({ length: count }, (_, i) => {
    const op = 'op_' + corpus.hash([input.seed, i, 0]).slice(0, 8);
    const kind = ['affine', 'quadratic', 'hinge'][i % 3];
    const first = program({ op, kind, epoch: i % 2 }, next);
    const compose = input.mode !== 'development' && i >= 12;
    return makeCase({ input, i, first, compose, next });
  });
}

function makeCase(data) {
  const { input, i, first, compose, next } = data;
  const second = program({ op: 'op_' + corpus.hash([input.seed, i, 1]).slice(0, 8),
    kind: ['affine', 'quadratic', 'hinge'][(i + 1) % 3], epoch: 0 }, next);
  const truthPrograms = compose ? [first, second] : [first];
  const query = { expression: corpus.expression(truthPrograms.map(rule => rule.op), 100 + next(100)),
    epochs: Object.fromEntries(truthPrograms.map(rule => [rule.op, rule.epoch])) };
  query.id = corpus.hash(query);
  const induction = input.mode === 'development' && i >= 4;
  const observations = induction ? [-2, -1, 0, 1, 2, 7].map((x, step) => ({
    step: step + 1, op: first.op, epoch: first.epoch, x, y: reference({ op: first.op, value: x }, [first]) })) : [];
  const distractor = { ...first, op: 'op_' + corpus.hash([input.seed, i, 2]).slice(0, 8), b: first.b === 3 ? -3 : first.b + 1 };
  const providedRules = induction ? [] : [distractor, ...truthPrograms];
  if (!induction && first.epoch === 1) providedRules.unshift({ ...first, epoch: 0, b: first.b === 3 ? -3 : first.b + 1 });
  return { id: query.id, group: induction ? 'induction_development' : 'provided_application', truthPrograms,
    expected: reference(query.expression, truthPrograms), payload: { query, observations, providedRules } };
}

function outcome(item, model) {
  const response = executor.execute(item.payload, model);
  return { item, model, response, correct: model.valid && response.source === 'validated_model_program'
    && !response.abstain && response.answer === item.expected, budgetVerified: inference.withinBudget(model) };
}

function controlPassed(report) {
  return report.mode === 'validation' && report.correct === 16 && report.nativeValid === 16
    && report.budgetsVerified && report.modelUnchanged && report.sourcesUnchanged;
}

async function main() {
  const mode = process.argv[2] || 'development';
  if (!['development', 'validation'].includes(mode)) throw Error('Unknown control mode');
  const directory = path.join('D:/genos-competence-results/rule-application-controls', crypto.randomUUID());
  fs.mkdirSync(directory, { recursive: true });
  const seed = crypto.randomBytes(24).toString('hex');
  const manifest = { schema: 'genos.rule-application.control/v1', mode, seed, model: await llm.describe(),
    cases: cases({ seed, mode }), sources: evidence.sourceHashes(), createdAt: new Date().toISOString(),
    thresholds: protocol.positiveControl, scope: 'Real LLM rule selection/transcription plus shared bounded interpreter; not native numeric generation' };
  evidence.write(directory, 'manifest.json', manifest);
  evidence.copySources(directory, manifest.sources);
  console.log(`Control: ${directory}\nManifest: ${corpus.hash(manifest)}`);
  const session = { calls: 0, maximumCalls: manifest.cases.length * 2, started: Date.now() };
  const rows = [];
  for (const item of manifest.cases) {
    const row = outcome(item, await inference.infer(item.payload, session));
    rows.push(row);
    fs.appendFileSync(path.join(directory, 'responses.jsonl'), JSON.stringify(row) + '\n');
  }
  const model = await llm.describe();
  const report = summarize(manifest, { rows, model, session });
  report.passed = controlPassed(report);
  evidence.write(directory, 'report.json', report);
  console.log(JSON.stringify(report, null, 2));
  if (mode === 'validation' && !report.passed) process.exitCode = 1;
}

function summarize(manifest, input) {
  const { rows, model, session } = input;
  const correct = rows.filter(row => row.correct).length;
  const nativeValid = rows.filter(row => row.model.valid).length;
  return { manifestHash: corpus.hash(manifest), mode: manifest.mode, calls: session.calls, correct, nativeValid,
    budgetsVerified: rows.every(row => row.budgetVerified), modelUnchanged: model.digest === manifest.model.digest,
    sourcesUnchanged: corpus.hash(evidence.sourceHashes()) === corpus.hash(manifest.sources),
    groups: [...new Set(rows.map(row => row.item.group))].map(group => ({ group,
      count: rows.filter(row => row.item.group === group).length, correct: rows.filter(row => row.item.group === group && row.correct).length })) };
}

function verify(directory, expectedHash) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  const report = JSON.parse(fs.readFileSync(path.join(directory, 'report.json'), 'utf8'));
  assert.equal(corpus.hash(manifest), expectedHash);
  assert.equal(manifest.mode, 'validation');
  assert.deepEqual(manifest.cases, cases({ mode: manifest.mode, seed: manifest.seed }));
  assert.deepEqual(manifest.sources, evidence.sourceHashes());
  const rows = fs.readFileSync(path.join(directory, 'responses.jsonl'), 'utf8').trim().split(/\r?\n/).map(JSON.parse);
  for (const [i, row] of rows.entries()) {
    assert.deepEqual(row.item, manifest.cases[i]);
    inference.verify(row.item.payload, row.model);
    assert.deepEqual(row, outcome(row.item, row.model));
  }
  assert.equal(rows.length, 16);
  assert.equal(rows.filter(row => row.correct && row.budgetVerified).length, 16);
  assert.equal(report.mode, 'validation');
  assert.equal(report.manifestHash, expectedHash);
  assert.equal(report.passed, true);
  assert.equal(report.modelUnchanged, true);
  assert.equal(report.sourcesUnchanged, true);
  return { directory, manifestHash: expectedHash, model: manifest.model, sources: manifest.sources, verified: true };
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { cases, reference, outcome, verify };
