const assert = require('node:assert/strict');
const dbModule = require('../src/db');

const originalGetDatabase = dbModule.getDatabase;
let rolloutReads = 0;
dbModule.getDatabase = async () => ({
  async get(sql) {
    if (sql.includes('release_rollouts')) return rolloutReads++ === 0 ? null : { id: 'rollout-1' };
    if (sql.includes('releases')) return { id: 'release-1', status: 'active', organization_id: 'org-1', project_id: 'project-1' };
    return null;
  },
  async run() { return { changes: 0 }; }
});
delete require.cache[require.resolve('../src/controllers/releaseController')];
const releases = require('../src/controllers/releaseController');

(async () => {
  const res = { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await releases.promote({ params: { id: 'release-1' }, body: { environment: 'production' }, tenant: { organizationId: 'org-1', projectId: 'project-1' } }, res, (error) => { throw error; });
  assert.equal(res.code, 409);
  assert.equal(res.body.error.code, 'RELEASE_STATE_CHANGED');
  dbModule.getDatabase = originalGetDatabase;
  console.log('Release promotion does not report success after a no-op mutation.');
})().catch((error) => { dbModule.getDatabase = originalGetDatabase; console.error(error); process.exitCode = 1; });