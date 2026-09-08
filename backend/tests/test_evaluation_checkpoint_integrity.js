const assert = require('node:assert/strict');
const { executeEvaluation } = require('../src/services/jobWorker');

let finalResult;
const db = {
  async all() {
    return [{ id: 'case-1', input_json: JSON.stringify({ output: 'answer' }), expected_json: JSON.stringify('answer') }];
  },
  async get(sql) { if (sql.includes('evaluation_jobs')) return { status: 'running' }; throw new Error(`Unexpected query: ${sql}`); },
  async run(sql, ...args) {
    if (sql.includes('status = ?')) finalResult = JSON.parse(args[1]);
    return { changes: 1 };
  }
};

executeEvaluation(db, {
  id: 'eval-checkpoint-integrity', dataset_id: 'dataset-1', organization_id: 'org-1', project_id: 'project-1',
  config_json: '{}',
  result_json: JSON.stringify({
    passed: 99,
    cases: [
      { id: 'case-1', passed: true, graders: { exact_match: { passed: true } } },
      { id: 'case-1', passed: true, graders: { exact_match: { passed: true } } },
      { id: 'unknown', passed: true, graders: { exact_match: { passed: true } } }
    ]
  })
}).then(() => {
  assert.equal(finalResult.passed, 1);
  assert.equal(finalResult.total, 1);
  assert.equal(finalResult.score, 1);
  console.log('Evaluation checkpoints are reconciled from valid unique cases.');
}).catch((error) => { console.error(error); process.exitCode = 1; });