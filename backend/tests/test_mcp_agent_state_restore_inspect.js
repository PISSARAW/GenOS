'use strict';

const assert = require('node:assert/strict');
const dbModule = require('../src/db');
const preflight = require('../src/services/organismRestorePreflight');

const TOOL = 'genos_agent_state_restore_inspect';
const ENV_NAMES = ['GENOS_MCP_LEASE', 'GENOS_MCP_DISABLED_TOOLS',
  'GENOS_MCP_ORGANIZATION_ID', 'GENOS_MCP_PROJECT_ID', 'GENOS_MCP_AGENT_ID'];

function readyReport() {
  return { ready: true, blockers: [], globalAtomic: false, runtimeRestartRequired: false,
    domains: Object.fromEntries(['agent', 'workspace', 'persistedState', 'orchestrator', 'runtime']
      .map((name) => [name, { status: 'ready' }])) };
}

async function run() {
  const previous = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
  const originalDatabase = dbModule.getDatabase;
  const originalInspect = preflight.inspect;
  const calls = [];
  const agent = { id: 'agent-1', workspace_id: 'workspace-1' };
  const state = { id: agent.id, workspace_id: agent.workspace_id, marker: 'sealed-test-state' };
  const db = {
    async get(sql, ...values) {
      calls.push({ sql, values });
      if (sql.includes('FROM agents')) return values.join('|') === 'agent-1|org|project' ? agent : null;
      if (sql.includes('FROM agent_state_snapshots')) {
        return values.join('|') === 'snapshot-1|agent-1|workspace-1'
          ? { state_json: JSON.stringify(state) } : null;
      }
      throw new Error('Unexpected read query.');
    },
    async run() { throw new Error('Inspection must not write.'); },
    async exec() { throw new Error('Inspection must not write.'); }
  };
  let report = readyReport();
  let inspected;
  try {
    process.env.GENOS_MCP_LEASE = TOOL;
    delete process.env.GENOS_MCP_DISABLED_TOOLS;
    process.env.GENOS_MCP_ORGANIZATION_ID = 'org';
    process.env.GENOS_MCP_PROJECT_ID = 'project';
    process.env.GENOS_MCP_AGENT_ID = agent.id;
    dbModule.getDatabase = async () => db;
    preflight.inspect = async (input) => { inspected = input; return report; };
    const handlerPath = require.resolve('../src/services/mcpBioTools/handlers/agentStateRestoreInspect');
    delete require.cache[handlerPath];
    const handler = require(handlerPath);
    const valid = await handler.handleAgentStateRestoreInspect({
      agent_id: agent.id, snapshot_id: 'snapshot-1' });
    assert.equal(valid.success, true);
    assert.equal(valid.ready, true);
    assert.equal(valid.restored, false);
    assert.equal(valid.runtimeStarted, false);
    assert.equal(valid.globalAtomic, false);
    assert.equal(valid.agentId, agent.id);
    assert.equal(valid.snapshotId, 'snapshot-1');
    assert.equal(inspected.db, db);
    assert.equal(inspected.agent, agent);
    assert.deepEqual(inspected.state, state);
    assert.deepEqual(inspected.scope.params, ['org', 'project']);
    const priorReads = calls.length;
    assert.equal((await handler.handleAgentStateRestoreInspect({
      agent_id: 'other', snapshot_id: 'snapshot-1' })).code, 'MCP_AGENT_ID_MISMATCH');
    assert.equal(calls.length, priorReads);
    delete process.env.GENOS_MCP_AGENT_ID;
    assert.equal((await handler.handleAgentStateRestoreInspect({
      agent_id: agent.id, snapshot_id: 'snapshot-1' })).code, 'MCP_AGENT_INSPECT_NOT_CONFIGURED');
    process.env.GENOS_MCP_AGENT_ID = agent.id;
    process.env.GENOS_MCP_PROJECT_ID = 'outside';
    assert.equal((await handler.handleAgentStateRestoreInspect({
      agent_id: agent.id, snapshot_id: 'snapshot-1' })).code, 'MCP_AGENT_INSPECT_NOT_FOUND');
    process.env.GENOS_MCP_PROJECT_ID = 'project';
    assert.equal((await handler.handleAgentStateRestoreInspect({
      agent_id: agent.id, snapshot_id: 'other-snapshot' })).code, 'MCP_AGENT_INSPECT_NOT_FOUND');
    const { dispatchTool } = require('../src/services/mcpToolRegistry');
    const routed = await dispatchTool(TOOL, { agent_id: agent.id, snapshot_id: 'snapshot-1' });
    assert.equal(routed.kind, 'bio');
    assert.equal(routed.result.success, true);
    for (const args of [
      { agent_id: agent.id },
      { snapshot_id: 'snapshot-1' },
      { agent_id: agent.id, snapshot_id: 'snapshot-1', extra: true },
      { agent_id: agent.id, snapshot_id: ' ' },
      { agent_id: 'x'.repeat(257), snapshot_id: 'snapshot-1' }
    ]) {
      assert.equal((await dispatchTool(TOOL, args)).result.status, 'invalid_args');
    }
    process.env.GENOS_MCP_LEASE = '';
    assert.equal((await dispatchTool(TOOL, { agent_id: agent.id, snapshot_id: 'snapshot-1' }))
      .result.code, 'MCP_TOOL_LEASE_DENIED');
    process.env.GENOS_MCP_LEASE = TOOL;
    process.env.GENOS_MCP_DISABLED_TOOLS = TOOL;
    assert.equal((await dispatchTool(TOOL, { agent_id: agent.id, snapshot_id: 'snapshot-1' }))
      .result.code, 'MCP_TOOL_LEASE_DENIED');
    report = { ...readyReport(), ready: false, blockers: [{ domain: 'runtime', code: 'RUNTIME_ACTIVE',
      message: 'Path C:/private/agent/state.json is locked.' }], domains: { ...readyReport().domains, runtime: { status: 'blocked' } } };
    const blocked = await handler.handleAgentStateRestoreInspect({ agent_id: agent.id, snapshot_id: 'snapshot-1' });
    assert.equal(blocked.success, true);
    assert.equal(blocked.ready, false);
    assert.equal(blocked.restored, false);
    assert.equal(blocked.blockers[0].message, 'Restore preflight blocked.');
    assert.equal(JSON.stringify(blocked).includes('C:/private/'), false);
    report = { ...readyReport(), globalAtomic: true };
    assert.equal((await handler.handleAgentStateRestoreInspect({ agent_id: agent.id,
      snapshot_id: 'snapshot-1' })).code, 'MCP_AGENT_INSPECT_CONTRACT_INVALID');
    report = { ...readyReport(), blockers: [{ domain: 'runtime', code: 'X', message: 'x'.repeat(256 * 1024) }] };
    assert.equal((await handler.handleAgentStateRestoreInspect({ agent_id: agent.id,
      snapshot_id: 'snapshot-1' })).code, 'MCP_AGENT_INSPECT_CONTRACT_INVALID');
    assert.equal(handler.handleAgentStateRestoreInspectError(new Error('private path')).error,
      'Restore preflight failed.');
    console.log('MCP restore inspection scope, lease, schema and read-only receipt passed.');
  } finally {
    dbModule.getDatabase = originalDatabase;
    preflight.inspect = originalInspect;
    delete require.cache[require.resolve('../src/services/mcpBioTools/handlers/agentStateRestoreInspect')];
    for (const name of ENV_NAMES) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

run().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
