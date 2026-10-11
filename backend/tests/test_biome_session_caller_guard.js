'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { guardTopologyCall } = require('../src/services/topologySessionCallerGuard');

function fixture() {
  const agents = {
    worker: { id: 'worker', workspace_id: 'workspace-1', execution_mode: 'worker',
      metadata_json: JSON.stringify({ topologySessionId: 'biome-1' }) },
    foreign: { id: 'foreign', workspace_id: 'workspace-2', execution_mode: 'worker',
      metadata_json: JSON.stringify({ topologySessionId: 'biome-2' }) },
    parent: { id: 'parent', workspace_id: 'workspace-1', execution_mode: 'orchestrator', metadata_json: '{}' }
  };
  const workspaces = {
    'workspace-1': { id: 'workspace-1', organization_id: 'org-1', project_id: 'project-1' },
    'workspace-2': { id: 'workspace-2', organization_id: 'org-2', project_id: 'project-2' }
  };
  const record = { id: 'biome-1', topology: 'biome', state: {
    biomeId: 'biome-1', ecology: { missionId: 'biome-1' } } };
  const db = {
    async get(sql, id) {
      if (sql.includes('FROM agents')) return agents[id] || null;
      if (sql.includes('FROM workspaces')) return workspaces[id] || null;
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    async all(sql, id, workspaceId) {
      if (!sql.includes('FROM agents')) throw new Error(`Unexpected SQL: ${sql}`);
      return id === 'parent' && workspaceId === 'workspace-1'
        ? [{ metadata_json: agents.worker.metadata_json }] : [];
    }
  };
  return { db, record, agents };
}

test('Biome guards both reads and mutations by persisted worker session and tenant', async () => {
  const { db, record } = fixture();
  const context = { agentId: 'worker', organizationId: 'org-1', projectId: 'project-1' };
  for (const operation of ['snapshot', 'allocate', 'forage', 'advance_variant', 'cycle', 'run']) {
    const args = { operation, session_id: 'biome-1' };
    assert.deepEqual(await guardTopologyCall(db, record, { args, context }), args);
  }
  await assert.rejects(guardTopologyCall(db, record, { args: { operation: 'snapshot' },
    context: { agentId: 'foreign' } }), { code: 'BIOME_CALLER_DENIED' });
  await assert.rejects(guardTopologyCall(db, record, { args: { operation: 'cycle' },
    context: { agentId: 'worker', organizationId: 'org-2' } }), { code: 'BIOME_CALLER_DENIED' });
});

test('Biome orchestrator needs a child in the same session and workspace', async () => {
  const { db, record, agents } = fixture();
  const args = { operation: 'run', session_id: 'biome-1' };
  assert.deepEqual(await guardTopologyCall(db, record, { args, context: { agentId: 'parent' } }), args);
  agents.worker.metadata_json = JSON.stringify({ topologySessionId: 'biome-2' });
  await assert.rejects(guardTopologyCall(db, record, { args, context: { agentId: 'parent' } }),
    { code: 'BIOME_CALLER_DENIED' });
});

test('Biome refuses invalid persisted session identity', async () => {
  const { db, record } = fixture();
  record.state.ecology.missionId = 'other';
  await assert.rejects(guardTopologyCall(db, record, {
    args: { operation: 'snapshot' }, context: { agentId: 'worker' }
  }), { code: 'BIOME_CALLER_DENIED' });
});
