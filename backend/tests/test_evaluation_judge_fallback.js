const assert = require('node:assert/strict');
const { executeEvaluation } = require('../src/services/jobWorker');
const modelRouter = require('../src/services/modelRouter');

const previousDefault = process.env.GENOS_DEFAULT_MODEL;
const originalGenerate = modelRouter.generate;
let requestedModels = [];
let invalidJudge = false;
process.env.GENOS_DEFAULT_MODEL = 'openai://judge';
modelRouter.generate = async ({ model }) => {
  requestedModels.push(model);
  if (invalidJudge && model === 'openai://judge') return { text: 'not-json', model };
  return { text: JSON.stringify({ score: 0.8, passed: true, reason: 'ok' }), inputTokens: 1, outputTokens: 1, model };
};

const db = {
  async all() { return [{ id: 'case-1', input_json: JSON.stringify({ output: 'answer' }), expected_json: JSON.stringify('answer') }]; },
  async get(sql) { if (sql.includes('evaluation_jobs')) return { status: 'running' }; throw new Error(`Unexpected query: ${sql}`); },
  async run() { return { changes: 1 }; }
};

executeEvaluation(db, {
  id: 'eval-judge-fallback', dataset_id: 'dataset-1', organization_id: 'org-1', project_id: 'project-1',
  config_json: JSON.stringify({ graders: ['llm_judge'], model: 'openai://evaluated', judgeModel: 'openai://judge' })
}).then(() => {
  assert.deepEqual(requestedModels, ['openai://evaluated', 'openai://judge']);
  console.log('llm_judge uses its explicit judge model.');
  invalidJudge = true;
  return assert.rejects(executeEvaluation({
    ...db,
    async run(sql, ...args) {
      if (sql.includes('UPDATE evaluation_jobs SET status')) return { changes: 1 };
      return { changes: 1 };
    }
  }, {
    id: 'eval-judge-invalid', dataset_id: 'dataset-1', organization_id: 'org-1', project_id: 'project-1',
    config_json: JSON.stringify({ graders: ['llm_judge'], judgeModel: 'openai://judge' })
  }), (error) => error.code === 'EVALUATION_JUDGE_ERROR' && error.retryable === true);
}).catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => {
    modelRouter.generate = originalGenerate;
    if (previousDefault === undefined) delete process.env.GENOS_DEFAULT_MODEL;
    else process.env.GENOS_DEFAULT_MODEL = previousDefault;
  });