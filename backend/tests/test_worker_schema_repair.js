'use strict';

const assert = require('node:assert/strict');
const { generateWithSchemaRepair } = require('../src/services/workerEvidenceSchemaRepair');

async function main() {
  const prompts = [];
  const results = [
    { text: '{bad}', schemaViolation: { missing: ['claims'] }, inputTokens: 5, outputTokens: 2, costUsd: 0.01 },
    { text: '{"claims":[]}', schemaViolation: null, inputTokens: 7, outputTokens: 4, costUsd: 0.02 }
  ];
  const result = await generateWithSchemaRepair({
    promptText: 'Return an evidence report.',
    generate: async (prompt) => { prompts.push(prompt); return results.shift(); }
  });
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /failed the required worker evidence schema/);
  assert.equal(result.text, '{"claims":[]}');
  assert.equal(result.inputTokens, 12);
  assert.equal(result.outputTokens, 6);
  assert.equal(result.costUsd, 0.03);
  assert.equal(result.schemaRepairAttempts, 1);
  const stillInvalid = await generateWithSchemaRepair({
    promptText: 'Return an evidence report.',
    generate: async () => ({ text: 'invalid', schemaViolation: { missing: ['outcome'] }, inputTokens: 1 })
  });
  assert.ok(stillInvalid.schemaViolation);
  assert.equal(stillInvalid.inputTokens, 2);
  console.log('Worker schema repair retry and usage aggregation: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
