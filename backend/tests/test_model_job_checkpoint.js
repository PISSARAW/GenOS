const assert = require('node:assert/strict');
const jobWorker = require('../src/services/jobWorker');
const modelRouter = require('../src/services/modelRouter');

const originalGenerate = modelRouter.generate;
const statements = [];
let generationCount = 0;
const db = {
  get: async () => ({ status: 'running' }),
  run: async (sql, ...params) => {
    statements.push({ sql, params });
    return { changes: 1 };
  }
};

modelRouter.generate = async ({ model, onToken }) => {
  generationCount += 1;
  await onToken('token', model);
  return { model, text: `output-${model}`, inputTokens: 1, outputTokens: 1 };
};

const job = { id: 'job-checkpoint', models_json: JSON.stringify(['model-a', 'model-b']), config_json: '{}', prompt: 'test', timeout_ms: 1000, result_json: null };
jobWorker.executeModelJob(db, job)
  .then(() => {
    assert.equal(generationCount, 2);
    assert.ok(statements.some((entry) => entry.sql.startsWith('UPDATE model_jobs SET result_json')));
    return jobWorker.executeModelJob(db, { ...job, result_json: JSON.stringify({ outputs: [{ model: 'model-a', text: 'existing' }], completedModels: ['model-a'] }) });
  })
  .then(() => assert.equal(generationCount, 3))
  .then(() => console.log('Model job checkpoint checks passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => { modelRouter.generate = originalGenerate; });