'use strict';

const assert = require('node:assert/strict');
const dbModule = require('../src/db');
const archiveModule = require('../src/services/inheritedOrganismArchive');

const TOOL = 'genos_agent_inherited_memory_read';
const ENV_NAMES = ['GENOS_MCP_LEASE', 'GENOS_MCP_DISABLED_TOOLS',
  'GENOS_MCP_ORGANIZATION_ID', 'GENOS_MCP_PROJECT_ID', 'GENOS_MCP_AGENT_ID'];

async function run() {
  const previous = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
  const originalDatabase = dbModule.getDatabase;
  const originalRead = archiveModule.readInheritedOrganismArchive;
  const calls = [];
  const db = { identity: 'test-db' };
  const source = { agentId: 'parent', snapshotId: 'sealed', organismHash: 'organism', persistedHash: 'state' };
  const record = { kind: 'memories', sourceRecordId: 'memory-1', sourceAgentId: 'parent',
    content: { actionType: 'read', rewardScore: 1, createdAt: '2026-10-10' },
    inherited: true, executable: false };
  let answer = { source, kind: 'memories', records: [record], inherited: true, runtimeTransferred: false };
  try {
    process.env.GENOS_MCP_LEASE = TOOL;
    delete process.env.GENOS_MCP_DISABLED_TOOLS;
    process.env.GENOS_MCP_ORGANIZATION_ID = 'org';
    process.env.GENOS_MCP_PROJECT_ID = 'project';
    process.env.GENOS_MCP_AGENT_ID = 'child';
    dbModule.getDatabase = async () => db;
    archiveModule.readInheritedOrganismArchive = async (input) => {
      calls.push(input);
      return answer;
    };
    const handlerPath = require.resolve('../src/services/mcpBioTools/handlers/agentInheritedMemoryRead');
    delete require.cache[handlerPath];
    const handler = require(handlerPath);
    const scoped = await handler.handleInheritedMemoryRead({ agent_id: 'child', kind: 'memories' });
    assert.equal(scoped.success, true);
    assert.equal(scoped.status, 'inherited_memory_read');
    assert.deepEqual(scoped.source, source);
    assert.deepEqual(scoped.records, [record]);
    assert.equal(scoped.runtimeTransferred, false);
    assert.deepEqual(calls[0], { db, tenant: { organizationId: 'org', projectId: 'project' },
      childAgentId: 'child', kind: 'memories', limit: 20 });
    const mismatch = await handler.handleInheritedMemoryRead({ agent_id: 'parent', kind: 'memories' });
    assert.equal(mismatch.code, 'MCP_AGENT_ID_MISMATCH');
    assert.equal(calls.length, 1);
    delete process.env.GENOS_MCP_AGENT_ID;
    const unbound = await handler.handleInheritedMemoryRead({ agent_id: 'child', kind: 'memories' });
    assert.equal(unbound.code, 'MCP_AGENT_ARCHIVE_NOT_CONFIGURED');
    process.env.GENOS_MCP_AGENT_ID = 'child';
    const { dispatchTool } = require('../src/services/mcpToolRegistry');
    const routed = await dispatchTool(TOOL, { agent_id: 'child', kind: 'memories', limit: 1 });
    assert.equal(routed.kind, 'bio');
    assert.equal(routed.result.success, true);
    assert.equal(calls[1].limit, 1);
    for (const args of [
      { agent_id: 'child', kind: 'memories', limit: 0 },
      { agent_id: 'child', kind: 'memories', limit: 51 },
      { agent_id: 'child', kind: 'memories', limit: 1.5 },
      { agent_id: 'child', kind: 'unsealed' },
      { agent_id: 'child', kind: 'memories', extra: true },
      { kind: 'memories' },
    ]) {
      const invalid = await dispatchTool(TOOL, args);
      assert.equal(invalid.result.status, 'invalid_args');
    }
    assert.equal(calls.length, 2);
    process.env.GENOS_MCP_LEASE = '';
    const denied = await dispatchTool(TOOL, { agent_id: 'child', kind: 'memories' });
    assert.equal(denied.result.code, 'MCP_TOOL_LEASE_DENIED');
    process.env.GENOS_MCP_LEASE = TOOL;
    process.env.GENOS_MCP_DISABLED_TOOLS = TOOL;
    const disabled = await dispatchTool(TOOL, { agent_id: 'child', kind: 'memories' });
    assert.equal(disabled.result.code, 'MCP_TOOL_LEASE_DENIED');
    delete process.env.GENOS_MCP_DISABLED_TOOLS;
    answer = { source, kind: 'memories', records: [record, record], inherited: true, runtimeTransferred: false };
    assert.equal((await handler.handleInheritedMemoryRead({ agent_id: 'child', kind: 'memories', limit: 1 })).success, false);
    answer = { source, kind: 'memories', records: [{ ...record, executable: true }], inherited: true, runtimeTransferred: false };
    assert.equal((await handler.handleInheritedMemoryRead({ agent_id: 'child', kind: 'memories' })).success, false);
    answer = { source, kind: 'memories', records: [record], runtimeTransferred: true, inherited: true };
    assert.equal((await handler.handleInheritedMemoryRead({ agent_id: 'child', kind: 'memories' })).success, false);
    answer = { source, kind: 'decisions', records: [record], runtimeTransferred: false, inherited: true };
    assert.equal((await handler.handleInheritedMemoryRead({ agent_id: 'child', kind: 'memories' })).success, false);
    answer = { source, kind: 'memories', records: [{ ...record, sourceAgentId: 'other' }],
      runtimeTransferred: false, inherited: true };
    assert.equal((await handler.handleInheritedMemoryRead({ agent_id: 'child', kind: 'memories' })).success, false);
    answer = { source, kind: 'decisions', records: [{ ...record, kind: 'decisions', content: 'x'.repeat(1024 * 1024) }],
      inherited: true, runtimeTransferred: false };
    assert.equal((await handler.handleInheritedMemoryRead({ agent_id: 'child', kind: 'decisions' })).success, false);
    assert.equal(handler.handleInheritedMemoryReadError(new Error('private path')).error,
      'Inherited archive read failed.');
    console.log('Inherited archive MCP scope, lease, validation and response bounds passed.');
  } finally {
    dbModule.getDatabase = originalDatabase;
    archiveModule.readInheritedOrganismArchive = originalRead;
    delete require.cache[require.resolve('../src/services/mcpBioTools/handlers/agentInheritedMemoryRead')];
    for (const name of ENV_NAMES) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

run().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
