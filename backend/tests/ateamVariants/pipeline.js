'use strict';

const assert = require('node:assert/strict');
const { createMockMembers, runVariantTest, relayDigest } = require('../fixtures/ateamVariantTestHelpers');

async function run(members, boundaries) {
  let passed = 0;
  let failed = 0;

  // ============ PIPELINE (4 tests) ============
  console.log('\n=== PIPELINE ===');

  // 5. Positive: Valid pipeline with caching
  try {
    let calls = 0;
    const mission = {
      variant: 'pipeline',
      input: { text: 'hello' },
      stages: [{
        stageId: 'normalize',
        inputSchema: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } },
        outputSchema: { type: 'object', required: ['text', 'normalized'], properties: { text: { type: 'string' }, normalized: { type: 'boolean' } } },
        run: async (value) => { calls++; return { ...value, normalized: true }; }
      }],
      maxRetries: 0
    };
    const result = await runVariantTest('pipeline', mission, { members: members.slice(0, 1), boundaries });
    assert.equal(result.status, 'SUCCEEDED');
    assert.equal(calls, 1);
    assert.ok(result.evidence.some(e => e.type === 'pipeline_succeeded'));
    console.log('✓ Pipeline: Executes stages with validation');
    passed++;
  } catch (e) { console.log('✗ Pipeline: Valid execution', e.message); failed++; }

  // 6. Positive: Retry on transient failure
  try {
    let attempts = 0;
    const mission = {
      variant: 'pipeline',
      input: { text: 'test' },
      maxRetries: 2,
      backoffMs: 1,
      stages: [{
        stageId: 'flaky',
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
        run: async (value, ctx) => { attempts++; if (ctx.attempt < 2) throw Object.assign(new Error('fail'), { code: 'TRANSIENT_FAILURE' }); return value; }
      }]
    };
    const result = await runVariantTest('pipeline', mission, { members: members.slice(0, 1), boundaries });
    assert.equal(result.status, 'SUCCEEDED');
    assert.equal(attempts, 2);
    console.log('✓ Pipeline: Retries failed stage');
    passed++;
  } catch (e) { console.log('✗ Pipeline: Retry logic', e.message); failed++; }

  // 7. Negative: Input contract rejection
  try {
    const mission = {
      variant: 'pipeline',
      input: { text: 123 },
      stages: [{
        stageId: 'validate',
        inputSchema: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } },
        outputSchema: { type: 'object' },
        run: async (v) => v
      }]
    };
    await runVariantTest('pipeline', mission, { members: members.slice(0, 1), boundaries });
    console.log('✗ Pipeline: Should reject invalid input');
    failed++;
  } catch (e) {
    assert.equal(e.code, 'INPUT_CONTRACT_REJECTED');
    console.log('✓ Pipeline: Rejects invalid input schema');
    passed++;
  }

  // 8. Negative: Output contract rejection
  try {
    const mission = {
      variant: 'pipeline',
      input: { text: 'ok' },
      stages: [{
        stageId: 'bad_output',
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object', required: ['missing'] },
        run: async () => ({ text: 'output' })
      }]
    };
    await runVariantTest('pipeline', mission, { members: members.slice(0, 1), boundaries });
    console.log('✗ Pipeline: Should reject invalid output');
    failed++;
  } catch (e) {
    assert.equal(e.code, 'ATEAM_STAGE_OUTPUT_INVALID');
    console.log('✓ Pipeline: Rejects invalid output schema');
    passed++;
  }

  return { passed, failed };
}

module.exports = run;
