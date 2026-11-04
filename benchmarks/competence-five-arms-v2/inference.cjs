'use strict';

const assert = require('node:assert/strict');
const llm = require('./llm.cjs');
const executor = require('./executor.cjs');
const contracts = require('./contracts.cjs');
const presentation = require('./presentation.cjs');

function summarize(attempts) {
  const last = attempts.at(-1);
  return { ...last, attempts, inputTokens: attempts.reduce((sum, row) => sum + (row.inputTokens || 0), 0),
    outputTokens: attempts.reduce((sum, row) => sum + (row.outputTokens || 0), 0),
    elapsedMs: attempts.reduce((sum, row) => sum + row.elapsedMs, 0) };
}

async function infer(payload, session) {
  const first = await llm.attempt(payload, session);
  const attempts = [first];
  const feedback = executor.feedback(payload, first);
  if (feedback) attempts.push(await llm.attempt({ ...payload, validationFeedback: feedback }, session));
  return summarize(attempts);
}

function withinBudget(model) {
  return model.attempts.length <= 2 && model.attempts.every(llm.withinBudget);
}

function verify(payload, model) {
  assert.ok(model.attempts.length >= 1 && model.attempts.length <= 2);
  let nextPayload = payload;
  for (const [index, row] of model.attempts.entries()) {
    let value = null;
    try { value = JSON.parse(row.raw); } catch (_) { /* Failed requests remain failures. */ }
    assert.deepEqual(value, row.value);
    assert.equal(row.valid, contracts.valid(value));
    if (row.prompt) assert.equal(row.prompt, presentation.prompt(nextPayload));
    if (row.schema) assert.deepEqual(row.schema, contracts.schema(payload.query));
    const feedback = executor.feedback(payload, row);
    if (index === 0 && feedback) nextPayload = { ...payload, validationFeedback: feedback };
  }
  const needed = executor.feedback(payload, model.attempts[0]) ? 2 : 1;
  assert.equal(model.attempts.length, needed);
  assert.deepEqual(model, summarize(model.attempts));
}

module.exports = { infer, summarize, withinBudget, verify };
