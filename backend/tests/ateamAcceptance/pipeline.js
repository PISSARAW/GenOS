'use strict';
const assert = require('node:assert/strict');
const helpers = require('../fixtures/ateamVariantTestHelpers');
const { createMockMembers, relayDigest } = helpers;
function runVariantTest(...args) { return helpers.runVariantTest(args[0], args[1], { members: args[2], boundaries: args[3] }); }

async function case1(context) {
  const { members, boundaries } = context;
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
    const result = await runVariantTest('pipeline', mission, members.slice(0, 1), boundaries);
    assert.equal(result.status, 'SUCCEEDED');
    assert.equal(calls, 1);
    assert.ok(result.evidence.some(e => e.type === 'pipeline_succeeded'));
    console.log('✓ Pipeline: Executes stages with validation');
    context.passed++;
  } catch (e) { console.log('✗ Pipeline: Valid execution', e.message); context.failed++; }

}

async function case2(context) {
  const { members, boundaries } = context;
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
    const result = await runVariantTest('pipeline', mission, members.slice(0, 1), boundaries);
    assert.equal(result.status, 'SUCCEEDED');
    assert.equal(attempts, 2);
    console.log('✓ Pipeline: Retries failed stage');
    context.passed++;
  } catch (e) { console.log('✗ Pipeline: Retry logic', e.message); context.failed++; }

}

async function case3(context) {
  const { members, boundaries } = context;
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
    await runVariantTest('pipeline', mission, members.slice(0, 1), boundaries);
    console.log('✗ Pipeline: Should reject invalid input');
    context.failed++;
  } catch (e) {
    assert.equal(e.code, 'INPUT_CONTRACT_REJECTED');
    console.log('✓ Pipeline: Rejects invalid input schema');
    context.passed++;
  }

}

async function case4(context) {
  const { members, boundaries } = context;
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
    await runVariantTest('pipeline', mission, members.slice(0, 1), boundaries);
    console.log('✗ Pipeline: Should reject invalid output');
    context.failed++;
  } catch (e) {
    assert.equal(e.code, 'ATEAM_STAGE_OUTPUT_INVALID');
    console.log('✓ Pipeline: Rejects invalid output schema');
    context.passed++;
  }

}

module.exports = async function run(context) {
  await case1(context);
  await case2(context);
  await case3(context);
  await case4(context);
};
