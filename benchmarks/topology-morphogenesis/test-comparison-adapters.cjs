'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { executeCondition, topologyProfile } = require('./comparisonAdapters.cjs');
const { validateExternalDataset } = require('./run-comparison-campaign.cjs');

test('conditional router changes the execution shape from declared query profile', () => {
  assert.equal(topologyProfile({ routingHint: 'single' }), 'single');
  assert.equal(topologyProfile({ routingHint: 'dependencies' }), 'team');
  assert.equal(topologyProfile({ routingHint: 'search' }), 'team');
});

test('communication-light executes independent messages and reports all measured tokens', async () => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return { ok: true, json: async () => ({ model: 'fixture-model', prompt_eval_count: 4,
      eval_count: 3, message: { content: '{"answer":1}' } }) };
  };
  try {
    const result = await executeCondition({ id: 'communication-light', adapter: 'communication-light' },
      { prompt: 'test prompt', routingHint: 'parallel' },
      { tokens: 1000, latencyMs: 5000, model: 'fixture-model', seed: 5, workspace: '.', dbPath: ':memory:' });
    assert.equal(result.error, null, result.error);
    assert.equal(calls, 4);
    assert.equal(result.messageCount, 4);
    assert.equal(result.tokenUsage.total, 28);
    assert.equal(result.tokenUsage.measured, true);
    assert.equal(result.candidate.answer, 1);
    assert.equal(result.servedModel, 'fixture-model');
  } finally { global.fetch = originalFetch; }
});

test('confirmatory dataset refuses bundled pilot tasks and missing separated inventories', () => {
  assert.throws(() => validateExternalDataset(require('./comparison-task-set.json'), 'confirmatory'), /datasetId, source and tasks/);
  const task = { id: 'holdout-1', family: 'new-family', comparisonEligible: true,
    prompt: 'independent question', oracle: { type: 'structured' } };
  assert.throws(() => validateExternalDataset({ datasetId: 'external', source: 'registry',
    tasks: [task], split: 'holdout' }, 'confirmatory'), /training inventories/);
});
