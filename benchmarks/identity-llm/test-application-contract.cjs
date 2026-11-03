'use strict';
const assert = require('node:assert/strict');
const contracts = require('./contracts.cjs');
const runtime = require('./runtime.cjs');
const scoring = require('./scoring.cjs');
const prompts = require('./prompts.cjs');
const inference = require('./inference.cjs');
const protocol = require('./config.cjs');

function prompt(input) {
  const expression = { op: 'inner', input: input.value };
  const lessons = { inner: input.rule };
  return { mode: 'evaluate', problem: { family: input.family, expression }, lessons,
    applicationPlan: runtime.application.describe(lessons, expression) };
}

function schemasDoNotCalculate() {
  const first = prompt({ family: 'number', value: 287, rule: { kind: 'affine', a: -2, b: -9 } });
  const second = prompt({ family: 'number', value: 953, rule: { kind: 'affine', a: 3, b: 8 } });
  assert.deepEqual(contracts.schema(first), contracts.schema(second), 'Schema must not encode computed numeric answers');
  assert.deepEqual(contracts.schema(first).properties.answer, { type: ['number','null'] });
  const text = { kind: 'text', prefix: '75', suffix: '23', reverse: true, upper: false };
  const left = prompt({ family: 'text', value: 'wordbbbbb', rule: text });
  const right = prompt({ family: 'text', value: '9Ab', rule: { ...text, prefix: '12', reverse: false, upper: true } });
  assert.deepEqual(contracts.schema(left), contracts.schema(right), 'Schema must not encode transformed characters or parameters');
  assert.deepEqual(contracts.schema(left).properties.answer, { type: ['string','null'] });
  assert(!contracts.instruction(first).includes('learningCalculation'));
  assert(!contracts.instruction(left).includes('Multiply magnitudes'));
}

function literalRoundTrips() {
  for (const value of [-100, 'wordbbbbb', 'a😀9']) {
    const plan = runtime.application.describe({}, { op: 'unknown', input: value });
    assert.equal(plan.literal.characters.join(''), String(value));
    assert.equal(plan.literal.value, value);
    assert.deepEqual(plan.unknownOperators, ['unknown']);
    assert.equal(plan.steps[0].rule, null);
    assert.equal(Object.hasOwn(plan, 'answer'), false);
  }
}

function rawErrorsStayErrors() {
  const response = { value: { answer: -296, confidence: 1,
    calculation: { step0: { input: 287, a: -2, b: -9, product: -574, output: -583 } } } };
  const before = JSON.stringify(response);
  assert.equal(scoring.answer(response, { solvable: true, expected: -583 }).exact, false);
  assert.equal(JSON.stringify(response), before, 'Scoring cannot overwrite the raw answer from a trace');
  assert.equal(scoring.answer({ value: { answer: '75bbbbword23', confidence: 1 } },
    { solvable: true, expected: '75bbbbbdrow23' }).exact, false);
}

function symbolicInputsStayUnsolved() {
  const problem = { family: 'number', expression: { op: 'inner', input: 287 } };
  const lessons = { inner: { kind: 'affine', a: -2, b: -9 } };
  const current = prompts.taskPrompt('evaluate', { problem, lessons });
  const distracted = prompts.taskPrompt('evaluate', { problem,
    lessons: { ...lessons, unrelated: { kind: 'affine', a: 7, b: 999 } } });
  assert.deepEqual(current, distracted, 'Unused rules must not enter the current context');
  assert.deepEqual(current.applicationPlan.expression.match(/-?\d+/g).map(Number), [-2,287,-9]);
  assert(!JSON.stringify(current).includes('-583'), 'Compiler cannot supply the computed answer');
  const text = prompt({ family: 'text', value: 'aB9',
    rule: { kind: 'text', prefix: '12', suffix: '34', reverse: true, upper: true } });
  assert(text.applicationPlan.expression.includes('"".join(["a","B","9"])'));
  assert(text.applicationPlan.expression.indexOf('[::-1]') < text.applicationPlan.expression.indexOf('.upper()'));
  assert(!text.applicationPlan.expression.includes('9BA'), 'Compiler cannot supply a transformed string');
}

async function wireDoesNotRepair() {
  const originalFetch = global.fetch;
  const current = prompt({ family: 'number', value: 287, rule: { kind: 'affine', a: -2, b: -9 } });
  const raw = '{"working":{"p0":-574,"y0":-583},"answer":-296,"confidence":1}';
  let sent;
  global.fetch = async (_, options) => {
    sent = JSON.parse(options.body);
    return { ok: true, json: async () => ({ model: protocol.modelAlias,
      choices: [{ message: { content: raw }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1 } }) };
  };
  try {
    const response = await inference.call(current);
    assert.deepEqual(response.requestMessages, sent.messages);
    assert.equal(sent.messages.length, 2);
    assert.equal(sent.messages[1].content, 'Evaluate these assignments in order:\np0 = (-2) * (287)\ny0 = p0 + (-9)\nanswer = y0');
    assert.equal(sent.temperature, 0);
    assert.equal(sent.max_tokens, 2048);
    assert.equal(sent.cache_prompt, true);
    assert.equal(sent.id_slot, 1);
    assert.equal(response.raw, raw);
    assert.equal(scoring.answer(response, { solvable: true, expected: -583 }).exact, false);
    const identity = { mode: 'identity', marker: 'unchanged identity wire context' };
    assert.equal(inference.messages(identity)[1].content, JSON.stringify(identity));
  } finally { global.fetch = originalFetch; }
}

module.exports = async function checks() {
  schemasDoNotCalculate();
  literalRoundTrips();
  rawErrorsStayErrors();
  symbolicInputsStayUnsolved();
  await wireDoesNotRepair();
  console.log('PASS application contract: lossless inputs, sparse retrieval, unevaluated programs, free raw answers');
};
