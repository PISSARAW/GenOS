'use strict';

const assert = require('node:assert/strict');
const { summarizeUsage } = require('./provider-usage.cjs');

const receipt = { runId: 'run-1', armId: 'genos-d-full', taskId: 'task-1', agentId: 'agent-1',
  responseId: 'response-1', provider: 'test-provider', model: 'test-model', inputTokens: 30,
  outputTokens: 8, cachedInputTokens: 4, costUsd: 0.002 };
const complete = summarizeUsage([receipt], { complete: true, callIds: ['response-1'] });
assert.equal(complete.inputTokens, 30);
assert.equal(complete.cachedInputTokens, 4);
assert.equal(complete.usageCoverage, 'complete');
assert.equal(summarizeUsage([receipt], null).usageCoverage, 'lower-bound');
assert.throws(() => summarizeUsage([{ ...receipt, inputTokens: 30.5 }], null));
assert.equal(summarizeUsage([receipt], { complete: true, callIds: [] }).usageCoverage, 'lower-bound');
console.log('communication-economy provider usage: ok');
