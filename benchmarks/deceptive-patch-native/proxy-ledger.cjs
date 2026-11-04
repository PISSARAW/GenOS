'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const protocol = require('./protocol.json');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

function create(directory) {
  return {directory, records: [], state: {calls: 0, knownTokens: 0, unknown: false, head: '0'.repeat(64)}};
}
function record(ledger, event) {
  const value = {...event, at: new Date().toISOString(), previous: ledger.state.head};
  ledger.state.head = digest(JSON.stringify(value));
  fs.appendFileSync(ledger.directory + '/provider-events.jsonl', JSON.stringify({...value, hash: ledger.state.head}) + '\n');
  ledger.records.push(value);
}
function available(state) {
  return state.calls < protocol.maxCalls && !state.unknown
    && state.knownTokens + protocol.contextTokens + protocol.maxOutputTokens <= protocol.maxTokens;
}
function terminal(raw) {
  try {return JSON.parse(raw);} catch {return lastFrame(raw);}
}
function lastFrame(raw) {
  try {return JSON.parse(raw.trim().split(/\r?\n/).at(-1));} catch {return null;}
}
function usage(ledger, result) {
  const reply = terminal(result.raw);
  const measured = result.ok && reply?.done === true
    && [reply.prompt_eval_count, reply.eval_count].every(value => Number.isSafeInteger(value) && value >= 0);
  if (measured) ledger.state.knownTokens += reply.prompt_eval_count + reply.eval_count;
  else ledger.state.unknown = true;
  record(ledger, {type: 'response', index: result.index, status: result.status, raw: result.raw, measured,
    inputTokens: measured ? reply.prompt_eval_count : null, outputTokens: measured ? reply.eval_count : null});
}
module.exports = {create, record, available, terminal, usage, digest};
