const assert = require('node:assert/strict');
const { updateCampaignStatus } = require('../src/services/jobWorker');

const queries = [];
const db = {
  async all(sql, ...params) {
    queries.push({ sql, params });
    return [{ status: 'completed' }];
  },
  async run(sql, ...params) {
    queries.push({ sql, params });
    return { changes: 1 };
  }
};

updateCampaignStatus(db, 'campaign-1', 'org-a', 'project-a').then(() => {
  assert.match(queries[0].sql, /organization_id = \?/);
  assert.deepEqual(queries[0].params, ['campaign-1', 'org-a', 'project-a']);
  assert.match(queries[1].sql, /organization_id = \?/);
  assert.deepEqual(queries[1].params, ['completed', 'campaign-1', 'org-a', 'project-a']);
  console.log('Evaluation campaign status updates remain tenant-scoped.');
}).catch((error) => { console.error(error); process.exitCode = 1; });