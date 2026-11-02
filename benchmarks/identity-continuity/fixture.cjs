'use strict';

const path = require('node:path');
const { createRequire } = require('node:module');
const backend = createRequire(path.resolve(__dirname, '../../backend/package.json'));
const service = name => backend(`./src/services/${name}`);
const store = service('identity/storage');
const ledger = service('identity/ledger');
const incarnations = service('identity/incarnations');
const checkpoints = service('identity/checkpoints');
const family = service('familyHistoryService');
const episodes = service('autobiographicalMemory/episodeStore');
const ROOT = 'subject';
const SCOPE = { organizationId: 'identity-benchmark', projectId: 'longitudinal' };

async function open(filename) {
  const db = await backend('sqlite').open({ filename, driver: backend('sqlite3').Database });
  await db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;');
  return db;
}

async function register(db, input) {
  await db.run(`INSERT INTO agents(id,name,role,execution_mode,status,workspace_id,model_tier,parent_agent_id)
    VALUES (?, 'identical-name', 'worker', 'worker', 'idle', ?, 'model-0', ?)`,
  input.id, input.workspace || 'local', input.parentId || null);
  await ledger.ensure(db, { agentId: input.id });
  await family.recordFamilyEvent(db, { agentId: input.id, parentId: input.parentId,
    eventType: 'birth', generation: input.generation || 0 });
}

async function fork(db, input) {
  await register(db, input);
  const checkpointId = `checkpoint:${input.id}`;
  await checkpoints.seal(db, { agentId: input.parentId, checkpointId,
    contentHash: store.hash({ parentId: input.parentId, childId: input.id }), coverage: ['identity'] });
  await checkpoints.fork(db, { parentId: input.parentId, childId: input.id, checkpointId });
}

async function schema(db) {
  await db.exec(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    CREATE TABLE agents (id TEXT PRIMARY KEY, name TEXT, role TEXT, execution_mode TEXT, status TEXT,
      workspace_id TEXT, model_tier TEXT, parent_agent_id TEXT, cognitive_revisions INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE autobiographical_episodes (id TEXT PRIMARY KEY, agent_id TEXT, mission_id TEXT, kind TEXT,
      organization_id TEXT, project_id TEXT, salience REAL, situation_json TEXT, decision_json TEXT,
      action_json TEXT, outcome_json TEXT, lesson_json TEXT, is_forgotten INTEGER DEFAULT 0, created_at TEXT);
    INSERT INTO workspaces VALUES ('local', 'identity-benchmark', 'longitudinal'),
      ('foreign', 'other-organization', 'longitudinal');`);
  await store.ready(db);
}

async function initialize(db, protocol) {
  await schema(db);
  await register(db, { id: ROOT });
  await register(db, { id: 'unrelated' });
  await register(db, { id: 'outsider', workspace: 'foreign' });
  for (let index = 0; index < protocol.directForks; index++) {
    await fork(db, { id: `fork-${index}`, parentId: ROOT, generation: 1 });
  }
  let parentId = 'fork-0';
  for (let depth = 1; depth <= protocol.descendantDepth; depth++) {
    const id = `descendant-${depth}`;
    await fork(db, { id, parentId, generation: depth + 1 });
    parentId = id;
  }
}

async function activate(db, id) {
  return incarnations.activate(db, { agentId: id, ownerId: `benchmark:${process.pid}`, ttlMs: 900000 });
}

module.exports = { open, initialize, activate, service, store, ledger, incarnations,
  checkpoints, family, episodes, ROOT, SCOPE };
