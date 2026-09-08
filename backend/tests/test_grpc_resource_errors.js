const assert = require('node:assert/strict');
const dbModule = require('../src/db');
const originalDb = dbModule.getDatabase;

dbModule.getDatabase = async () => ({ get: async (sql) => sql.includes('FROM workspaces') ? { id: 'workspace', path: 'C:/workspace' } : null });
delete require.cache[require.resolve('../src/grpc_services/experimentService')];
delete require.cache[require.resolve('../src/grpc_services/agentService')];
const experimentService = require('../src/grpc_services/experimentService');
const agentService = require('../src/grpc_services/agentService');

Promise.all([
  new Promise((resolve) => experimentService.GetExperimentStatus({ request: { experiment_id: 'missing', organization_id: 'org', project_id: 'project' } }, (error, value) => {
    assert.equal(error.code, 5);
    assert.equal(value, undefined);
    resolve();
  })),
  new Promise((resolve) => agentService.StopMission({ request: { id: 'missing', workspace_id: 'workspace', organization_id: 'org', project_id: 'project' } }, (error, value) => {
    assert.equal(error.code, 5);
    assert.equal(value, undefined);
    resolve();
  }))
]).then(() => console.log('gRPC missing resources use NOT_FOUND errors.'))
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => { dbModule.getDatabase = originalDb; });