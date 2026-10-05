'use strict';
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-axolotl-'));
  const filename = path.join(directory, 'state.sqlite');
  const db = await open({ filename, driver: sqlite3.Database });
  await db.exec(`CREATE TABLE agents (id TEXT PRIMARY KEY, workspace_id TEXT, execution_mode TEXT);
    INSERT INTO agents VALUES ('parent', 'workspace', 'orchestrator'), ('stranger', 'other', 'orchestrator');
    CREATE TABLE learned_traits (id TEXT PRIMARY KEY, trait_name TEXT, trait_description TEXT,
      source_agent_id TEXT, context_id TEXT, trait_data_json TEXT, promotion_level INTEGER, confidence REAL,
      usage_count INTEGER, created_at TEXT, updated_at TEXT);`);
  return { db, filename, directory, reopen: () => open({ filename, driver: sqlite3.Database }),
    cleanup: () => fs.rm(directory, { recursive: true, force: true }) };
}
function topology() {
  return { structure: 'centralized', knowledge: { rule: 'safe' }, components: [
    { id: 'input', role: 'sensory_input' }, { id: 'damaged', role: 'processing' }, { id: 'memory', role: 'memory' }
  ], connections: [
    { from: 'input', to: 'damaged', type: 'route', weight: 2 },
    { from: 'damaged', to: 'memory', type: 'route' },
    { from: 'memory', to: 'damaged', type: 'feedback' }
  ] };
}
function contract() {
  return { requiredRoles: ['sensory_input', 'processing', 'memory'], probes: [
    { id: 'route', kind: 'route', from: 'input', to: 'memory', payload: 'request', expected: 'request' },
    { id: 'rule', kind: 'recall', key: 'rule', expected: 'safe' }
  ] };
}
function planInput(db) {
  return { db, orchestratorId: 'parent', mission: 'Deliver requests and recall the safe rule', reason: 'Damaged processor',
    currentTopology: topology(), functionalContract: contract(), scope: { type: 'components', componentIds: ['damaged'] } };
}
module.exports = { fixture, topology, contract, planInput };