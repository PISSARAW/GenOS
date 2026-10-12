'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const execution = require('../src/services/strategyExecutionService');
const observation = require('../src/services/missionActionModelObservation');

function fixture(overrides = {}) {
  const row = { id: 'attempt-1', mission_id: 'run-1', action_id: 'action-1',
    agent_id: 'worker-1', organization_id: 'org-1', project_id: 'project-1',
    status: 'completed', provider_called: 1, token_usage_source: 'provider',
    input_tokens: 5, output_tokens: 3, cost_usd: 0.000022, ...overrides };
  return { db: { get: async () => row }, input: {
    action: { id: 'action-1', kind: 'small_model' },
    request: { executionRunId: 'run-1', agentId: 'worker-1' },
    binding: { scope: { organizationId: 'org-1', projectId: 'project-1' } },
    result: { routeAttemptId: 'attempt-1', text: '{"found":true}' }
  } };
}

async function main() {
  const original = execution.recordExecutionEvent;
  const events = [];
  execution.recordExecutionEvent = async (_db, agentId, event) => {
    events.push({ agentId, event });
    return { run: { id: 'run-1' }, halt: false };
  };
  try {
    const valid = fixture();
    assert.equal((await observation.observe(valid.db, valid.input)).recorded, true);
    assert.equal(events.length, 1);
    assert.equal(events[0].agentId, 'worker-1');
    assert.equal(events[0].event.id, 'mission-model-usage:attempt-1');
    assert.equal(events[0].event.payload.usage.input_tokens, 5);
    assert.equal(events[0].event.payload.usage.output_tokens, 3);
    assert.equal(events[0].event.payload.usage.cost_usd, 0.000022);
    assert.equal(events[0].event.payload.outputEncoding, 'utf8-raw-text');
    assert.equal(events[0].event.payload.outputDigest,
      `sha256:${crypto.createHash('sha256').update('{"found":true}').digest('hex')}`);
    assert.equal((await observation.observe(fixture({ token_usage_source: 'estimate' }).db,
      valid.input)).recorded, false);
    assert.equal((await observation.observe(fixture({ action_id: 'other' }).db,
      valid.input)).recorded, false);
    assert.equal(events.length, 1);
    const noOutput = fixture();
    noOutput.input.result = { routeAttemptId: 'attempt-1' };
    assert.equal((await observation.observe(noOutput.db, noOutput.input)).recorded, true);
    assert.equal(events.at(-1).event.payload.outputDigest, null);
    execution.recordExecutionEvent = async () => ({ halt: true });
    await assert.rejects(observation.observe(valid.db, valid.input),
      { code: 'MISSION_MODEL_USAGE_NOT_RECORDED' });
  } finally { execution.recordExecutionEvent = original; }
  console.log('Measured model attempt observation: passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
