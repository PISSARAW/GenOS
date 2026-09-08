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
  const result = await executor.execute({ agentId: 'immune-test', organizationId: 'org', projectId: 'project', toolName: 'genos_run', args: { command: 'echo ok; drop table users' } });
  assert.equal(result.success, false);
  assert.equal(result.status, 'blocked');
  assert.ok(result.threats.includes('SQL_INJECTION'));
  assert.ok(audit.length > 0);
  dbModule.getDatabase = originalDb;
  executor.executeConfiguredTransport = originalTransport;
  console.log('Immune threat gate blocks dangerous MCP payloads before transport.');
})().catch((error) => { dbModule.getDatabase = originalDb; executor.executeConfiguredTransport = originalTransport; console.error(error); process.exitCode = 1; });