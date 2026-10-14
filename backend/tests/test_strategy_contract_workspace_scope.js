'use strict';

const assert = require('node:assert/strict');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const contracts = require('../src/services/strategyContractService');

async function insert(db, input) {
  const { id, agentId, workspaceId, version } = input;
  const value = { strategy: id };
  await db.run(
    'INSERT INTO strategy_contracts (id, agent_id, workspace_id, version, status, primary_strategy, contract_hash, contract_json, decision_reason, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, agentId, workspaceId, version, 'active', id, contracts.hashContract(value), JSON.stringify(value), 'test', 'test'
  );
}

async function runTest() {
  const db = await sqlite.open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await db.exec(`CREATE TABLE strategy_contracts (
      id TEXT PRIMARY KEY, agent_id TEXT, workspace_id TEXT, version INTEGER, status TEXT,
      primary_strategy TEXT, contract_hash TEXT, contract_json TEXT, decision_reason TEXT,
      created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );`);
    await insert(db, { id: 'contract-a', agentId: 'agent-a', workspaceId: 'workspace-a', version: 1 });
    assert.equal(await contracts.getLatestContract(db, 'agent-a', 'workspace-b'), null);
    await insert(db, { id: 'contract-b', agentId: 'agent-a', workspaceId: 'workspace-b', version: 2 });
    assert.equal((await contracts.getLatestContract(db, 'agent-a', 'workspace-b')).id, 'contract-b');
    await insert(db, { id: 'contract-legacy', agentId: 'legacy-agent', workspaceId: null, version: 1 });
    const legacy = await contracts.getLatestContract(db, 'legacy-agent', 'workspace-b');
    assert.equal(legacy.id, 'contract-legacy');
    assert.equal(legacy.workspaceId, null);
  } finally {
    await db.close();
  }
}

runTest().then(() => console.log('Strategy contract workspace scope: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
