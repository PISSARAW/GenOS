'use strict';

const assert = require('node:assert/strict');
const { digest } = require('../src/services/biologicalIntegrity');
const { validateInvocationReceipts } = require('../src/services/socialMentalModelRuntimeService');

const turns = [{ seq: 1, speaker: 'agent-a', utterance: 'Hello.' },
  { seq: 2, speaker: 'agent-b', utterance: 'I agree.' }];
const good = turns.map((turn, index) => ({ seq: turn.seq, provider: 'ollama', servedModel: 'local-model',
  invocationId: `00000000-0000-4000-8000-00000000000${index + 1}`,
  promptHash: digest(`prompt-${index}`), contentHash: digest(turn.utterance) }));

function rejects(receipts, code = 'SOCIAL_MEMORY_PROVIDER_PROVENANCE_INVALID') {
  assert.throws(() => validateInvocationReceipts(turns, receipts), { code });
}

assert.equal(validateInvocationReceipts(turns, good).length, 2);
rejects(good.map(({ invocationId, ...receipt }) => receipt));
rejects(good.map(({ promptHash, ...receipt }) => receipt));
rejects(good.map((receipt, index) => index ? receipt : { ...receipt, contentHash: digest('altered') }));
rejects(good.map((receipt, index) => index ? receipt : { ...receipt, invocationId: good[1].invocationId }));
console.log('Social runtime local invocation provenance: required IDs, prompt hashes, exact turn hashes and distinct calls passed.');
