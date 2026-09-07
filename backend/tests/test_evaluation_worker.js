const assert = require('node:assert/strict');
const { executeEvaluation } = require('../src/services/jobWorker');

async function main() {
  const updates = [];
  const db = {
    async all(sql) {
      assert.match(sql, /dataset_cases/);
      return [{
        id: 'case-1',
        input_json: JSON.stringify({
          output: 'answer [source:s1]',
          sources: [{ id: 's1', content: 'answer' }]
        }),
        expected_json: JSON.stringify('answer [source:s1]')
      }];
    },
    async get(sql) {
      if (sql.includes('evaluation_jobs')) return { status: 'running' };
      throw new Error(`Unexpected db.get: ${sql}`);
    },
    async run(sql, ...args) {
      updates.push({ sql, args });
      return { changes: 1 };
    }
  };

  await executeEvaluation(db, {
    id: 'eval-1',
    dataset_id: 'dataset-1',
    config_json: JSON.stringify({ graders: ['exact_match', 'groundedness', 'safety'] })
  });

  const completion = updates.find((entry) => entry.sql.includes('UPDATE evaluation_jobs'));
  assert.ok(completion);
  const result = JSON.parse(completion.args[1]);
  assert.equal(result.score, 1);
  assert.equal(result.graderSummary.exact_match.score, 1);
  assert.equal(result.graderSummary.groundedness.score, 1);
  assert.equal(result.graderSummary.safety.score, 1);
  console.log('evaluation worker: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
