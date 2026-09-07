const assert = require('node:assert/strict');
const jobWorker = require('../src/services/jobWorker');
const modelRouter = require('../src/services/modelRouter');

const originalGenerate = modelRouter.generate;
const timeouts = [];
const db = { get: async () => ({ status: 'running' }), run: async () => ({ changes: 1 }) };
modelRouter.generate = async ({ timeoutMs }) => {
  timeouts.push(timeoutMs);
  await new Promise((resolve) => setTimeout(resolve, 15));
  return { model: 'model', text: 'ok' };
};

const job = { id: 'job-deadline', models_json: JSON.stringify(['a', 'b']), config_json: '{}', prompt: 'test', timeout_ms: 25, result_json: null };
(async () => {
  let failure;
  try { await jobWorker.executeModelJob(db, job); } catch (error) { failure = error; }
  assert.equal(failure?.code, 'MODEL_JOB_TIMEOUT');
  assert.ok(timeouts.length < 2 || timeouts[1] < timeouts[0], 'each model must receive the remaining total deadline');
  console.log('Model job total deadline checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { modelRouter.generate = originalGenerate; });