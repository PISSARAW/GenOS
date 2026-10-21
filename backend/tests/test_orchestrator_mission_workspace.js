'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const contracts = require('../src/services/strategyContractService');
const { initializeMission } = require('../bin/orchestratorMissionInitialization.cjs');

async function main() {
  const root = await fs.mkdtemp(path.join(process.cwd(), '.mission-workspace-'));
  const otherRoot = await fs.mkdtemp(path.join(process.cwd(), '.mission-workspace-other-'));
  const originalCwd = process.cwd();
  const db = await sqlite.open({ filename: ':memory:', driver: sqlite3.Database });
  const originalGet = contracts.getLatestContract;
  const originalSave = contracts.saveContract;
  let saved;
  contracts.getLatestContract = async () => null;
  contracts.saveContract = async (_db, input) => { saved = input; };
  try {
    await fs.writeFile(path.join(root, 'package.json'), '{}');
    await fs.writeFile(path.join(otherRoot, 'package.json'), '{}');
    await db.exec(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, name TEXT, path TEXT UNIQUE,
      visibility TEXT, language TEXT, description TEXT, tags TEXT, updated_at DATETIME);
      CREATE TABLE agents (id TEXT PRIMARY KEY, name TEXT, role TEXT, status TEXT,
      execution_mode TEXT, workspace_id TEXT, model_tier TEXT, isolation_mode TEXT, current_task TEXT);`);
    await db.run("INSERT INTO workspaces (id, name, path) VALUES ('legacy-relative', 'Legacy', '.')");
    process.chdir(root);
    await initializeMission({ db, action: 'dispatch_team', orchestratorId: 'root', task: 'test',
      request: { workspace_root: root } });
    const agent = await db.get('SELECT workspace_id FROM agents WHERE id = ?', 'root');
    const workspace = await db.get('SELECT id, path FROM workspaces WHERE id = ?', agent.workspace_id);
    assert.notEqual(workspace.id, 'legacy-relative');
    assert.equal(path.resolve(workspace.path), path.resolve(root));
    assert.equal(saved.workspaceId, workspace.id);
    await assert.rejects(initializeMission({ db, action: 'dispatch_team', orchestratorId: 'other', task: 'test',
      request: { workspace_id: 'missing' } }), { code: 'ORCHESTRATOR_WORKSPACE_INVALID' });
    await initializeMission({ db, action: 'dispatch_team', orchestratorId: 'bound', task: 'test',
      request: { workspace_root: otherRoot } });
    await assert.rejects(initializeMission({ db, action: 'dispatch_worker', orchestratorId: 'bound', task: 'test',
      request: { workspace_root: root } }), { code: 'ORCHESTRATOR_WORKSPACE_MISMATCH' });
    console.log('Top-level mission orchestrator workspace binding: PASS');
  } finally {
    process.chdir(originalCwd);
    contracts.getLatestContract = originalGet;
    contracts.saveContract = originalSave;
    await db.close();
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(otherRoot, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
