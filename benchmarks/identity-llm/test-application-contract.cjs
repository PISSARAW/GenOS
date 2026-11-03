'use strict';
const assert = require('node:assert/strict');
const contracts = require('./contracts.cjs');
const runtime = require('./runtime.cjs');
const scoring = require('./scoring.cjs');
const prompts = require('./prompts.cjs');
const inference = require('./inference.cjs');
const protocol = require('./config.cjs');
const application = require('./application-contract.cjs');

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
  assert.deepEqual(Object.keys(contracts.schema(first).properties), ['reasoning','answer','confidence']);
  const text = { kind: 'text', prefix: '75', suffix: '23', reverse: true, upper: false };
  const left = prompt({ family: 'text', value: 'wordbbbbb', rule: text });
  const right = prompt({ family: 'text', value: '9Ab', rule: { ...text, prefix: '12', reverse: false, upper: true } });
  assert.deepEqual(contracts.schema(left), contracts.schema(right), 'Schema must not encode transformed characters or parameters');
  assert.deepEqual(contracts.schema(left).properties.answer, { type: ['string','null'] });
  assert(!contracts.instruction(first).includes('learningCalculation'));
  assert(!contracts.instruction(left).includes('Multiply magnitudes'));
  const learning = { ...first, mode: 'learn', feedback: { family: 'text', op: 'previous',
    examples: [{ input: 'ab', output: '12BA34' }, { input: 'cd', output: '12DC34' }] } };
  const schema = contracts.schema(learning);
  assert.deepEqual(Object.keys(schema.properties), ['learningCalculation','update','reasoning','answer','confidence']);
  assert.equal(schema.properties.update.anyOf[1].properties.rule.properties.prefix.pattern, '^[0-9]{2}$');
  assert(contracts.instruction(learning).includes('An unknown current answer does not block learningCalculation or update'));
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
  const escaped = { value: JSON.parse(JSON.stringify({ answer: String.raw`\u0038\u0036`, confidence: 1 })) };
  assert.equal(scoring.answer(escaped, { solvable: true, expected: '86' }).exact, false,
    'Literal backslash escapes cannot receive a second decoding pass');
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
  const rendered = inference.messages(text)[1].content;
  assert(rendered.includes('Original text: "aB9"'));
  assert(rendered.includes('0:"a" 1:"B" 2:"9"'));
  assert(!rendered.includes('9BA'), 'Presentation cannot execute the text rule');
  assert(!rendered.includes('"".join'), 'Model receives the original literal without a join operation to guess');
  const unknown = runtime.application.describe(lessons, { op: 'missing', input: problem.expression });
  const missing = application.message(unknown);
  assert(missing.includes('Operation 2: UNKNOWN OPERATION. Definition is missing.'));
  assert(missing.indexOf('Multiply') < missing.indexOf('UNKNOWN'));
  const knownSchema = contracts.schema(current);
  const unknownSchema = contracts.schema({ ...current, applicationPlan: unknown });
  assert.deepEqual(knownSchema, unknownSchema, 'Missing definitions cannot force the expected null answer through the schema');
}

async function wireDoesNotRepair() {
  const originalFetch = global.fetch;
  const current = prompt({ family: 'number', value: 287, rule: { kind: 'affine', a: -2, b: -9 } });
  const raw = '{"reasoning":"Product is -574 and sum is -583","answer":-296,"confidence":1}';
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
    assert.deepEqual(response.request, sent);
    assert.equal(sent.messages.length, 2);
    assert.equal(sent.messages[1].content, 'Original number: 287\nOperation 1: Multiply the current number by (-2), then add (-9).');
    assert.equal(sent.temperature, 0);
    assert.equal(sent.max_tokens, 2048);
    assert.deepEqual(sent.response_format, { type: 'json_object', schema: contracts.schema(current) });
    assert.equal(sent.cache_prompt, true);
    assert.equal(sent.id_slot, 1);
    assert.equal(response.raw, raw);
    assert.equal(scoring.answer(response, { solvable: true, expected: -583 }).exact, false);
    const identity = { mode: 'identity', marker: 'unchanged identity wire context' };
    assert.equal(inference.messages(identity)[1].content, JSON.stringify(identity));
  } finally { global.fetch = originalFetch; }
}

async function alteredRequestsAreRejected() {
  const current = prompt({ family: 'number', value: 287, rule: { kind: 'affine', a: -2, b: -9 } });
  const body = inference.request(current);
  body.max_tokens = 8192;
  const events = [{ type: 'response-committed', prompt: current,
    response: { requestMessages: inference.messages(current), request: body } }];
  await assert.rejects(require('./verify.cjs').replayEvents(null, { events, w: {} }), /Exact request or generation contract changed/);
}

module.exports = async function checks() {
  schemasDoNotCalculate();
  literalRoundTrips();
  rawErrorsStayErrors();
  symbolicInputsStayUnsolved();
  await wireDoesNotRepair();
  await alteredRequestsAreRejected();
  console.log('PASS application contract: literal operations, free reasoning, exact requests, unchanged raw answer scoring');
};
