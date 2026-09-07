const assert = require('node:assert/strict');
const router = require('../src/services/modelRouter');
const provider = require('../src/services/modelProvider');
const telemetry = require('../src/services/telemetryObserver');

const originalGenerate = provider.generate;
const originalEmit = telemetry.emitEvent;
const events = [];
let calls = 0;
provider.generate = async ({ model }) => {
  calls += 1;
  if (calls === 1) throw new Error('temporary provider failure');
  return { model, provider: 'openai', text: 'ok', inputTokens: 1, outputTokens: 1 };
};
telemetry.emitEvent = (event) => { events.push(event); };

router.generate({
  policy: { primary: 'openai://primary', fallbacks: ['openai://backup'], mode: 'fallback' },
  prompt: 'test'
}).then((result) => {
  assert.equal(result.model, 'openai://backup');
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, 'MODEL_ROUTE_FAILED');
  assert.equal(events[0].payload.model, 'openai://primary');
  console.log('Model fallback failures are observable.');
}).catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => {
    provider.generate = originalGenerate;
    telemetry.emitEvent = originalEmit;
  });