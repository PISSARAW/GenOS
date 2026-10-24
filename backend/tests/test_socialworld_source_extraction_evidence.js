'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { verifySocialExtraction, stableHash } = require('../src/services/socialWorldSourceEvidence');

function sourceRecord(quote) {
  const extraction = { answer: 'yes', evidenceQuote: quote };
  const receipt = { invocationId: '00000000-0000-4000-8000-000000000001',
    promptHash: 'a'.repeat(64), outputHash: stableHash(extraction), provider: 'ollama', servedModel: 'qwen2.5:14b',
    provenance: 'genos-modelProvider-local-invocation', provenanceSource: 'GenOS modelProvider local invocation' };
  return { memory: { otherAgentId: 'peer' }, receipt: { socialExtractionReceipt: receipt }, sourceEvent: {
    turns: [{ speaker: 'peer', utterance: 'The peer completed the review and cited the source.' }],
    artifact: { content: { socialObservation: { statement: quote, polarity: 'supports', polarityWhenAnswerYes: 'supports',
      socialExtraction: { ...extraction, receipt } } } },
  } };
}

test('source extraction evidence binds polarity and quote to a persisted peer turn', () => {
  const errors = [];
  verifySocialExtraction(sourceRecord('completed the review'), { caseData: { requiresDialogueExtraction: true }, errors });
  assert.deepEqual(errors, []);
});

test('source extraction evidence rejects a quote absent from the peer turn', () => {
  const errors = [];
  verifySocialExtraction(sourceRecord('the peer promised a refund'), { caseData: { requiresDialogueExtraction: true }, errors });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /exact persisted peer-turn quote/);
});
