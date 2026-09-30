'use strict';

const assert = require('node:assert/strict');
const dbModule = require('../src/db');

const originalDb = dbModule.getDatabase;
const audit = [];
dbModule.getDatabase = async () => ({
  get: async () => null,
  run: async (...args) => { audit.push(args); return { changes: 1 }; },
});
delete require.cache[require.resolve('../src/services/mcpExecutor')];
const executor = require('../src/services/mcpExecutor');
const originalTransport = executor.executeConfiguredTransport;
executor.executeConfiguredTransport = async () => { throw new Error('MCP transport must not run after cnidocyte interception'); };

executor.execute({
  agentId: 'system', organizationId: 'org', projectId: 'project',
  toolName: 'genos_snapshot', args: { agent: 'worker', out: 'eval(malicious)' },
}).then((result) => {
  assert.equal(result.success, false);
  assert.equal(result.status, 'blocked');
  assert.equal(result.policy.reason, 'CNIDOCYTE_REFLEX_INTERCEPTED');
  assert.ok(result.latencyMicros > 0);
  assert.ok(audit.some(([, , , action, , decision, reason]) => action === 'WORKFLOW_TOOL_CALL' && decision === 'deny' && reason.includes('eval(')));
  dbModule.getDatabase = originalDb;
  executor.executeConfiguredTransport = originalTransport;
  console.log('MCP cnidocyte gate blocks before transport and records measured latency.');
}).catch((error) => {
  dbModule.getDatabase = originalDb;
  executor.executeConfiguredTransport = originalTransport;
  console.error(error);
  process.exitCode = 1;
});
