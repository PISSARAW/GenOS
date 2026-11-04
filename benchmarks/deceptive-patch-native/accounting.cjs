'use strict';
const fs = require('node:fs');
const {hash} = require('../deceptive-patch-bench/io.cjs');

function usage(directory) {
  const filename = directory + '/provider-events.jsonl';
  if (!fs.existsSync(filename)) return {calls: 0, knownTokens: 0, complete: true, chainHead: null};
  let head = '0'.repeat(64), tokens = 0;
  const dispatched = new Set(), measured = new Set();
  for (const line of fs.readFileSync(filename, 'utf8').trim().split('\n')) {
    const {hash: expected, ...event} = JSON.parse(line);
    if (event.previous !== head || hash(JSON.stringify(event)) !== expected) throw Error('PROVIDER_CHAIN_INVALID');
    head = expected;
    if (event.type === 'dispatch') {
      if (dispatched.has(event.index)) throw Error('PROVIDER_DISPATCH_DUPLICATED');
      dispatched.add(event.index);
    }
    if (event.type === 'response' && event.measured) {
      validateResponse(event, {dispatched, measured});
      measured.add(event.index); tokens += event.inputTokens + event.outputTokens;
    }
  }
  const complete = [...dispatched].every(index => measured.has(index));
  return {calls: dispatched.size, knownTokens: tokens, complete, chainHead: head};
}
function validateResponse(event, state) {
  if (!state.dispatched.has(event.index)) throw Error('PROVIDER_RESPONSE_WITHOUT_DISPATCH');
  if (state.measured.has(event.index)) throw Error('PROVIDER_RESPONSE_DUPLICATED');
  if (![event.inputTokens, event.outputTokens].every(value => Number.isSafeInteger(value) && value >= 0)) {
    throw Error('PROVIDER_USAGE_INVALID');
  }
}
module.exports = {usage};
