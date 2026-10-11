'use strict';

const assert = require('node:assert/strict');
const { guardTopologyCall } = require('../src/services/topologySessionCallerGuard');

function database(caller, children = []) {
  return {
    get: async () => caller,
    all: async (_query, parentId, workspaceId) => {
      assert.equal(parentId, caller.id);
      assert.equal(workspaceId, caller.workspace_id);
      return children;
    }
  };
}

function envelope(agentId) {
  return { args: { operation: 'materialize', session_id: 'sync-1' }, context: { agentId } };
}

async function main() {
  const record = { id: 'sync-1', topology: 'syncytium', state: {} };
  const parent = { id: 'parent', workspace_id: 'ws-1', execution_mode: 'orchestrator' };
  await assert.rejects(guardTopologyCall(database(parent), record, envelope('parent')),
    (error) => error.code === 'TOPOLOGY_CALLER_DENIED');
  const foreign = [{ metadata_json: JSON.stringify({ topologySessionId: 'sync-2' }) }];
  await assert.rejects(guardTopologyCall(database(parent, foreign), record, envelope('parent')),
    (error) => error.code === 'TOPOLOGY_CALLER_DENIED');
  const linked = [{ metadata_json: JSON.stringify({ topologySessionId: 'sync-1' }) }];
  assert.equal((await guardTopologyCall(database(parent, linked), record, envelope('parent'))).operation,
    'materialize');
  const unrelated = { id: 'viewer', execution_mode: 'viewer' };
  await assert.rejects(guardTopologyCall(database(unrelated), record, envelope('viewer')),
    (error) => error.code === 'TOPOLOGY_CALLER_DENIED');
  console.log('Syncytium caller session scope: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
