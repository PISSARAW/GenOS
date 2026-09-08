const assert = require('node:assert/strict');
const dbModule = require('../src/db');

const originalGetDatabase = dbModule.getDatabase;
dbModule.getDatabase = async () => ({ get: async () => ({ usedTokens: 250 }) });
delete require.cache[require.resolve('../src/controllers/configController')];
const config = require('../src/controllers/configController');

(async () => {
  const tenant = { organizationId: 'org-1', projectId: 'project-1' };
  const missing = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  config.updateProfile({ tenant, body: {} }, missing);
  assert.equal(missing.code, 400);
  const budget = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await config.updateBudget({ tenant, body: { maxTokens: 1000 } }, budget, (error) => { throw error; });
  assert.equal(budget.body.usedTokens, 250);
  assert.equal(budget.body.percent, 25);
  dbModule.getDatabase = originalGetDatabase;
  console.log('Configuration success responses reflect real mutations and usage.');
})().catch((error) => { dbModule.getDatabase = originalGetDatabase; console.error(error); process.exitCode = 1; });