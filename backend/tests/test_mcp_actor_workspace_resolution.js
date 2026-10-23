'use strict';

const assert = require('node:assert/strict');
const actor = require('../src/services/mcpActorCapability');
const authority = require('../src/services/missionEnvelopeAuthority');

async function run() {
  const originals = { assertRun: authority.assertRun, realWorkspaceRoot: authority.realWorkspaceRoot };
  let capability = null;
  let receiptCount = 0;
  let resolutions = 0;
  const expiresAt = new Date(Date.now() + 60000).toISOString();
  authority.assertRun = async () => ({ status: 'authorized', hash: 'authority-hash',
    envelope: { workspaceRoot: 'validated:workspace', expiresAt,
      toolLease: ['allowed-tool'], budgets: { events: 3 } } });
  authority.realWorkspaceRoot = async (root) => {
    resolutions += 1;
    return `validated:${root}`;
  };
  const db = {
    exec: async () => {},
    all: async () => [{ name: 'max_calls' }, { name: 'calls_used' }],
    run: async (...args) => {
      const [sql, tokenHash, agentId, runId, authorityHash, workspaceRoot, expiry, maxCalls] = args;
      if (sql.includes('INSERT INTO mcp_actor_capabilities')) {
        capability = { token_hash: tokenHash, agent_id: agentId, run_id: runId,
          authority_hash: authorityHash, workspace_root: workspaceRoot, expires_at: expiry,
          max_calls: maxCalls, calls_used: 0, revoked_at: null };
      }
      if (sql.includes('INSERT INTO mcp_actor_lease_receipts')) receiptCount += 1;
      return { changes: 1 };
    },
    get: async (sql) => sql.includes('MAX(sequence)')
      ? { sequence: receiptCount + 1 } : capability
  };
  try {
    const token = await actor.issue(db, { agentId: 'worker', runId: 'run', workspaceRoot: 'workspace' });
    const verified = await actor.verify(db, { token, workspaceRoot: 'workspace', toolName: 'allowed-tool' });
    assert.equal(verified.workspace_root, 'validated:workspace');
    const tokenVerified = await actor.verifyFromToken(db, { token, toolName: 'allowed-tool' });
    assert.equal(tokenVerified.workspace_root, 'validated:workspace');
    assert.equal(resolutions, 2);
  } finally {
    authority.assertRun = originals.assertRun;
    authority.realWorkspaceRoot = originals.realWorkspaceRoot;
  }
  console.log('MCP actor workspace resolution uses the locked-workspace authority path.');
}

run().catch((failure) => { console.error(failure); process.exitCode = 1; });
