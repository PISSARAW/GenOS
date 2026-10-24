'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { storeObject } = require('../src/services/agentGitService/storeObjectHelper.cjs');
const { linkCapture, verifyLink } = require('../src/services/agentGitService/checkpointBridge.cjs');

const fields = ['name', 'name_meaning', 'role', 'model_tier', 'language', 'isolation_mode',
  'dissonance_level', 'eureka_count', 'cognitive_budget', 'cognitive_baseline_budget',
  'cognitive_max_dissonance', 'is_apoptotic', 'status', 'current_task'];

function organism() {
  const state = { id: 'agent-a', workspace_id: 'workspace-a', name: 'Agent A' };
  const agentState = Object.fromEntries(fields.map((field) => [field, state[field] ?? null]));
  const workspaceSnapshot = { id: 'workspace-snapshot', hash: 'workspace-hash', workspaceId: 'workspace-a' };
  const manifest = { schemaVersion: 1, components: {}, capturedAt: '2026-10-24T00:00:00Z', consistency: {} };
  const signed = { agentState, workspaceSnapshot, components: manifest.components,
    capturedAt: manifest.capturedAt, consistency: manifest.consistency };
  manifest.hash = crypto.createHash('sha256').update(JSON.stringify(signed)).digest('hex');
  return { ...state, _genosSnapshot: { workspaceSnapshot, organismSnapshot: manifest } };
}

async function main() {
  const sealed = organism();
  const objects = new Map();
  const refs = [];
  const db = {
    get: async (sql, id) => sql.includes('agent_state_snapshots')
      ? { id, state_json: JSON.stringify(sealed) } : objects.get(id),
    run: async (sql, ...args) => {
      if (sql.includes('INSERT INTO agent_git_objects')) objects.set(args[0], {
        id: args[0], agent_id: args[1], workspace_id: args[2], state_hash: args[6],
        state_json: args[7], metadata_json: args[8], signature: args[9],
        tree_hash: args[12], commit_hash: args[13], signature_algorithm: args[14]
      });
      if (sql.includes('INSERT INTO agent_git_refs')) refs.push(args);
    }
  };
  const checkpoint = { schema: 'genos.agent-checkpoint/v1', snapshotId: 'sealed-one',
    organismHash: sealed._genosSnapshot.organismSnapshot.hash, workspaceHash: 'workspace-hash' };
  const object = await storeObject(db, { agentId: 'agent-a', workspaceId: 'workspace-a',
    kind: 'commit', state: { schema: 'genos.agent-git-state/v1', agent: { id: 'agent-a' } },
    metadata: { checkpoint } });
  assert.equal((await verifyLink(db, objects.get(object.id))).valid, true);
  const agentGit = require('../src/services/agentGitService');
  const originalCollect = agentGit.collectState;
  try {
    agentGit.collectState = async () => ({ schema: 'genos.agent-git-state/v1',
      agent: { id: 'agent-a', workspace_id: 'workspace-a' } });
    const linked = await linkCapture({ db, req: { body: {}, user: { username: 'tester' } },
      agentId: 'agent-a', snapshotId: 'sealed-one', state: sealed, refName: 'main' });
    assert.equal(linked.refName, 'checkpoint/main');
    assert.equal(refs.length, 1);
    assert.equal((await verifyLink(db, objects.get(linked.objectId))).valid, true);
  } finally { agentGit.collectState = originalCollect; }
  sealed.name = 'tampered';
  assert.equal((await verifyLink(db, objects.get(object.id))).valid, false);
  console.log('AgentGit sealed checkpoint bridge passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
