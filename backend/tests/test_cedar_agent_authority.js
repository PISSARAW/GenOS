'use strict';

const assert = require('node:assert/strict');
const cedar = require('../src/services/cedarAgentAuthority');
const authority = require('../src/services/agentAuthorityService');

const parent = { id: 'parent', workspace_id: 'workspace-a', execution_mode: 'orchestrator' };
const worker = { id: 'worker', workspace_id: 'workspace-a', execution_mode: 'worker', parent_agent_id: 'parent' };
const peer = { id: 'peer', workspace_id: 'workspace-a', execution_mode: 'worker', parent_agent_id: 'other' };
const foreign = { id: 'foreign', workspace_id: 'workspace-b', execution_mode: 'worker', parent_agent_id: 'parent' };

function decision(principal, resource, action) {
  return cedar.authorize({ principal, resource, action, workspaceId: 'workspace-a' });
}

assert.equal(cedar.validatePolicy(), true);
assert.throws(() => cedar.validatePolicy('permit(principal, action, missing);'), (error) => error.code === 'CEDAR_POLICY_INVALID');
assert.equal(decision(parent, parent, 'StartMission'), true);
assert.equal(decision(parent, worker, 'StartMission'), true);
assert.equal(decision(worker, worker, 'StartMission'), false);
const delegated = { id: 'delegated', execution_mode: 'worker', parent_agent_id: worker.id, workspace_id: worker.workspace_id };
assert.equal(decision(worker, delegated, 'StartMission'), false);
assert.equal(decision({ ...worker, boundedDelegationChildId: delegated.id }, delegated, 'StartMission'), true);
assert.equal(decision({ ...worker, boundedDelegationChildId: 'different-child' }, delegated, 'StartMission'), false);
assert.equal(decision(peer, worker, 'StartMission'), false);
assert.equal(decision(parent, foreign, 'StartMission'), false);
const capsule = { ...foreign, capsuleDispatchParentId: parent.id };
assert.equal(cedar.authorize({ principal: parent, resource: capsule, action: 'StartMission', workspaceId: 'workspace-b' }), true);
assert.equal(cedar.authorize({ principal: parent, resource: capsule, action: 'Control', workspaceId: 'workspace-b' }), true);
assert.equal(cedar.authorize({ principal: parent, resource: foreign, action: 'StartMission', workspaceId: 'workspace-b' }), false);
assert.equal(cedar.authorize({ principal: parent, resource: foreign, action: 'Control', workspaceId: 'workspace-b' }), false);
assert.equal(cedar.authorize({ principal: parent, resource: { ...capsule, capsuleDispatchParentId: 'other' }, action: 'StartMission', workspaceId: 'workspace-b' }), false);
assert.equal(cedar.authorize({ principal: parent, resource: worker, action: 'StartMission', workspaceId: 'workspace-b' }), false);
assert.equal(decision(parent, worker, 'Control'), true);
assert.equal(decision(worker, worker, 'Control'), true);
assert.equal(decision(peer, worker, 'Control'), false);
assert.equal(decision(parent, foreign, 'Control'), false);
assert.equal(decision(parent, worker, 'Unknown'), false);
assert.equal(cedar.authorize({ principal: parent, resource: worker, action: 'Control', workspaceId: '' }), false);

async function verifyRuntimeBoundary() {
  const rows = new Map([
    [parent.id, { ...parent, name: 'Parent', status: 'idle' }],
    [worker.id, { ...worker, name: 'Worker', status: 'idle' }],
    [peer.id, { ...peer, name: 'Peer', status: 'idle' }]
  ]);
  const db = {
    get: async (sql, id) => String(sql).includes('WITH RECURSIVE') ? null : rows.get(id)
  };
  assert.equal((await authority.authorizeMission(db, { agentId: worker.id, orchestratorAgentId: parent.id })).id, worker.id);
  assert.equal((await authority.authorizeMission(db, { agentId: parent.id })).id, parent.id);
  assert.equal((await authority.authorizeAgentControl(db, { actorId: parent.id, targetId: worker.id })).id, worker.id);
  await assert.rejects(() => authority.authorizeAgentControl(db, { actorId: peer.id, targetId: worker.id }),
    (error) => error.code === 'AGENT_CONTROL_FORBIDDEN');
  rows.set(parent.id, { ...rows.get(parent.id), execution_mode: 'worker' });
  await assert.rejects(() => authority.authorizeMission(db, { agentId: worker.id, orchestratorAgentId: parent.id }),
    (error) => error.code === 'WORKER_CONTRACT_DENIED');
}

verifyRuntimeBoundary().then(() => console.log('Cedar agent authority: all assertions passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
