'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const dbModule = require('../src/db');

async function createFixture() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    CREATE TABLE agents (id TEXT PRIMARY KEY, workspace_id TEXT);
    INSERT INTO workspaces VALUES ('workspace-a', 'org-a', 'project-a');
    INSERT INTO workspaces VALUES ('workspace-b', 'org-b', 'project-b');
    INSERT INTO agents VALUES ('agent-a', 'workspace-a');
    INSERT INTO agents VALUES ('agent-b', 'workspace-b');`);
  return db;
}

async function testCallerAndTenantScope(db) {
  const priorDatabase = dbModule.getDatabase;
  const priorLease = process.env.GENOS_MCP_LEASE;
  const priorAgent = process.env.GENOS_AGENT_ID;
  const priorUrl = process.env.GENOS_MCP_URL;
  const topology = require('../src/services/biologicalTopologyService');
  const priorCompose = topology.composeMode;
  dbModule.getDatabase = async () => db;
  process.env.GENOS_MCP_LEASE = 'genos_biological_mode';
  delete process.env.GENOS_AGENT_ID;
  topology.composeMode = async ({ orchestratorId }) => ({
    communityId: `community-${orchestratorId}`, variant: 'fixture'
  });
  try {
    const args = { mode: 'biome', mission: 'Check authenticated caller scope.', orchestrator_id: 'agent-a' };
    const registry = require('../src/services/mcpToolRegistry');
    const anonymous = await registry.dispatchTool('genos_biological_mode', args);
    assert.equal(anonymous.result.code, 'MCP_CALLER_REQUIRED');

    const substituted = await registry.dispatchTool('genos_biological_mode', args, { agentId: 'agent-b' });
    assert.equal(substituted.result.code, 'BIOLOGICAL_MODE_CALLER_MISMATCH');

    const wrongTenant = await registry.dispatchTool('genos_biological_mode', args, {
      agentId: 'agent-a', tenant: { organizationId: 'org-b', projectId: 'project-b' }
    });
    assert.equal(wrongTenant.result.code, 'BIOLOGICAL_MODE_TENANT_MISMATCH');

    const authorized = await registry.dispatchTool('genos_biological_mode', args, {
      agentId: 'agent-a', tenant: { organizationId: 'org-a', projectId: 'project-a' }
    });
    assert.equal(authorized.result.success, true);
    assert.equal(authorized.result.communityId, 'community-agent-a');

    const executeToolLogic = require('../src/services/mcpExecutor/transports/toolLogic').executeToolLogic;
    const transport = await executeToolLogic('genos_biological_mode', args, {
      agentId: 'agent-a', tenant: { organizationId: 'org-a', projectId: 'project-a' }
    });
    assert.equal(transport.success, true);
    assert.equal(transport.communityId, 'community-agent-a');

    process.env.GENOS_MCP_URL = 'http://127.0.0.1:9';
    const configured = await require('../src/services/mcpExecutor').executeConfiguredTransport({
      toolName: 'genos_biological_mode', args, agentId: 'agent-a',
      tenant: { organizationId: 'org-a', projectId: 'project-a' }
    });
    assert.equal(configured.success, true);
    assert.equal(configured.communityId, 'community-agent-a');
  } finally {
    dbModule.getDatabase = priorDatabase;
    topology.composeMode = priorCompose;
    restoreEnv('GENOS_MCP_LEASE', priorLease);
    restoreEnv('GENOS_AGENT_ID', priorAgent);
    restoreEnv('GENOS_MCP_URL', priorUrl);
  }
}

function restoreEnv(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

async function run() {
  const db = await createFixture();
  try { await testCallerAndTenantScope(db); }
  finally { await db.close(); }
}

run().then(() => console.log('Biological mode caller scope: PASS'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
