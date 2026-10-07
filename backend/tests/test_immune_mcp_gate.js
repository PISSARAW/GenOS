const assert = require('node:assert/strict');
const dbModule = require('../src/db');

const originalDb = dbModule.getDatabase;
const audit = [];
dbModule.getDatabase = async () => ({
  get: async () => null,
  run: async (...args) => { audit.push(args); return { changes: 1 }; }
});
delete require.cache[require.resolve('../src/services/mcpExecutor')];
const executor = require('../src/services/mcpExecutor');
const originalTransport = executor.executeConfiguredTransport;
executor.executeConfiguredTransport = async () => { throw new Error('transport must not be reached'); };

(async () => {
  const request = { organizationId: 'org', projectId: 'project', toolName: 'genos_run', args: { command: 'select x union select y' } };
  const denied = await executor.execute({ ...request, agentId: 'immune-test' });
  assert.equal(denied.status, 'deny');
  assert.equal(denied.policy.reason, 'agent_permission_missing');
  assert.equal(audit.length, 1, 'unauthorized calls must not reach the immune scanner');
  const result = await executor.execute({ ...request, agentId: 'system' });
  assert.equal(result.success, false);
  assert.equal(result.status, 'blocked');
  assert.ok(result.threats.includes('SQL_INJECTION'));
  assert.equal(audit.length, 3, 'authorized calls receive policy and immune audit entries');
  dbModule.getDatabase = originalDb;
  executor.executeConfiguredTransport = originalTransport;
  console.log('MCP permission denial precedes the immune gate; authorized threats stop before transport.');
})().catch((error) => { dbModule.getDatabase = originalDb; executor.executeConfiguredTransport = originalTransport; console.error(error); process.exitCode = 1; });
