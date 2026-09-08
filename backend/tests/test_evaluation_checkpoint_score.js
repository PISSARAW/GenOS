const assert = require('node:assert/strict');
const { executeEvaluation } = require('../src/services/jobWorker');

const scores = [];
const db = {
  async all() {
    return ['a', 'b', 'c'].map((id) => ({
      id,
      input_json: JSON.stringify({ output: id }),
      expected_json: JSON.stringify(id === 'c' ? 'different' : id)
    }));
  },
  async get(sql) { if (sql.includes('evaluation_jobs')) return { status: 'running' }; throw new Error(`Unexpected query: ${sql}`); },
  async run(sql, ...args) {
    if (sql.startsWith('UPDATE evaluation_jobs SET result_json = ? WHERE')) scores.push(JSON.parse(args[0]).score);
    return { changes: 1 };
  }
};

executeEvaluation(db, {
  id: 'eval-checkpoint-score', dataset_id: 'dataset-1', organization_id: 'org-1', project_id: 'project-1',
  config_json: '{}',
  result_json: JSON.stringify({ passed: 1, cases: [{ id: 'a', passed: true, graders: { exact_match: { passed: true } } }] })
}).then(() => {
  assert.deepEqual(scores, [2 / 3, 2 / 3]);
  console.log('Evaluation checkpoint scores use the full dataset denominator.');
}).catch((error) => { console.error(error); process.exitCode = 1; });