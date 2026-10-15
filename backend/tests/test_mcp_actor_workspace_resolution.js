'use strict';

const assert = require('node:assert/strict');
const actor = require('../src/services/mcpActorCapability');
const authority = require('../src/services/missionEnvelopeAuthority');

async function run() {
  const originals = { assertRun: authority.assertRun, realWorkspaceRoot: authority.realWorkspaceRoot };
  let capability = null;
  let resolutions = 0;
  const expiresAt = new Date(Date.now() + 60000).toISOString();
  authority.assertRun = async () => ({ status: 'authorized', hash: 'authority-hash',
    envelope: { workspaceRoot: 'validated:workspace', expiresAt, toolLease: ['allowed-tool'] } });
  authority.realWorkspaceRoot = async (root) => {
    resolutions += 1;
    return `validated:${root}`;
  };
  const db = {
    exec: async () => {},
    run: async (_sql, tokenHash, agentId, runId, authorityHash, workspaceRoot, expiry) => {
      capability = { token_hash: tokenHash, agent_id: agentId, run_id: runId,
        authority_hash: authorityHash, workspace_root: workspaceRoot, expires_at: expiry, revoked_at: null };
      return { changes: 1 };
    },
    get: async () => capability
  };
  try {
    const token = await actor.issue(db, { agentId: 'worker', runId: 'run', workspaceRoot: 'workspace' });
    const verified = await actor.verify(db, { token, workspaceRoot: 'workspace', toolName: 'allowed-tool' });
    assert.equal(verified.workspace_root, 'validated:workspace');
    assert.equal(resolutions, 2);
  } finally {
    authority.assertRun = originals.assertRun;
    authority.realWorkspaceRoot = originals.realWorkspaceRoot;
  }
  console.log('MCP actor workspace resolution uses the locked-workspace authority path.');
}

run().catch((failure) => { console.error(failure); process.exitCode = 1; });
