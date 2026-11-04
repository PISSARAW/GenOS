'use strict';

require('../competence-five-arms/test.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const executor = require('./executor.cjs');
const contracts = require('./contracts.cjs');
const presentation = require('./presentation.cjs');
const control = require('./control.cjs');
const corpus = require('../competence-five-arms/corpus.cjs');

const rule = { op: 'op_d1a00001', epoch: 0, kind: 'affine', a: 3, b: 3, c: 0 };
const query = { expression: { op: rule.op, value: 159 }, epochs: {}, id: 'unit' };
const payload = { query, observations: [], providedRules: [rule] };
const model = { valid: true, value: { programs: [rule], confidence: 1, abstain: false, reason: 'answerable', missing: [] } };

test('Former observed-value confusion is fixed: the supplied3x+3 program applies to159', () => {
  assert.equal(executor.execute(payload, model).answer, 480);
  assert.equal(executor.execute(payload, model).source, 'validated_model_program');
});

test('Typed executor supports nonlinearity and composition without generated code', () => {
  const square = { op: 'op_d1a00002', epoch: 0, kind: 'quadratic', a: 1, b: 0, c: 1 };
  const expression = corpus.expression([rule.op, square.op], 2);
  assert.equal(executor.evaluate(expression, { [rule.op]: rule, [square.op]: square }), 82);
  assert.equal(executor.evaluate({ op: 'op_d1a00003', value: 8 }, {
    op_d1a00003: { kind: 'hinge', a: 2, b: 1, c: 3 } }), 26);
});

test('A wrong coefficient does not become an answer through the interpreter', () => {
  const wrong = { ...model, value: { ...model.value, programs: [{ ...rule, b: 2 }] } };
  assert.equal(executor.execute(payload, wrong).source, 'rejected_model_program');
  assert.equal(executor.execute(payload, wrong).abstain, true);
});

test('A duplicated or unrelated operator cannot satisfy query binding', () => {
  const bad = { ...model, value: { ...model.value, programs: [rule, rule] } };
  assert.equal(executor.execute(payload, bad).source, 'rejected_model_program');
});

test('Missing evidence and repeated single points retain distinct refusal causes', () => {
  const missing = executor.execute({ ...payload, providedRules: [] }, model);
  assert.equal(missing.reason, 'missing');
  const observations = Array.from({ length: 4 }, (_, step) => ({ step, op: rule.op, epoch: 0, x: 0, y: 3 }));
  const ambiguous = executor.execute({ ...payload, providedRules: [], observations }, model);
  assert.equal(ambiguous.source, 'minimum_evidence_gate');
  assert.equal(ambiguous.reason, 'ambiguous');
});

test('An inferred nonlinear model program is validated only against observed public data', () => {
  const program = { ...rule, kind: 'quadratic', a: 2, b: -1, c: 3 };
  const observations = [-2, -1, 0, 1, 2, 7].map(x => ({ op: rule.op, epoch: 0, x, y: 2 * x * x - x + 3 }));
  const inferred = { ...model, value: { ...model.value, programs: [program] } };
  const response = executor.execute({ ...payload, observations, providedRules: [] }, inferred);
  assert.equal(response.answer, 50406);
});

test('Current-epoch evidence vetoes a stale supplied model program', () => {
  const changed = { ...rule, epoch: 1, b: 2 };
  const current = { ...query, epochs: { [rule.op]: 1 } };
  const response = executor.execute({ query: current, observations: [], providedRules: [changed] }, model);
  assert.equal(response.source, 'rejected_model_program');
});

test('Correction feedback contains a public training witness, never the query answer', () => {
  const observations = [-2, -1, 0, 1, 2, 7].map(x => ({ op: rule.op, epoch: 0, x, y: 3 * x + 3 }));
  const wrong = { ...model, value: { ...model.value, programs: [{ ...rule, b: 2 }] } };
  const feedback = executor.feedback({ ...payload, observations, providedRules: [] }, wrong);
  assert.equal(feedback.witnesses[0].x, -2);
  assert.equal(feedback.witnesses[0].observed, -3);
  assert.equal(feedback.witnesses[0].predicted, -4);
  assert.ok(!JSON.stringify(feedback).includes('480'));
  assert.equal(executor.feedback({ ...payload, observations, providedRules: [] }, model), null);
});

test('Numeric answers and executable strings cannot replace typed program parameters', () => {
  assert.equal(contracts.valid({ answer: 480 }), false);
  assert.equal(contracts.programValid({ ...rule, a: 'process.exit()' }), false);
  assert.equal(contracts.programValid({ ...rule, a: 4 }), false);
});

test('Provided-rule controls cover sixteen independent cases and do not expose answers in prompts', () => {
  const cases = control.cases({ mode: 'validation', seed: 'unit-validation' });
  assert.equal(cases.length, 16);
  for (const item of cases) {
    assert.ok(!('expected' in item.payload));
    assert.ok(!('truthPrograms' in item.payload));
    const correct = { valid: true, value: { ...model.value, programs: item.truthPrograms } };
    assert.equal(executor.execute(item.payload, correct).answer, item.expected);
    assert.ok(presentation.prompt(item.payload).includes('CURRENT CONTEXT'));
  }
});

test('The campaign refuses to start without a passed positive control before any model call', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'run.cjs')], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /PASSING_POSITIVE_CONTROL_REQUIRED/);
});
