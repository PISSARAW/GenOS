'use strict';
const { createRequire } = require('node:module');
const path = require('node:path');
const protocol = require('./config.cjs');
const backend = createRequire(path.join(protocol.sourceRoot, 'backend/package.json'));
const service = name => backend(`./src/services/${name}`);
const store = service('identity/storage');
const ledger = service('identity/ledger');
const incarnations = service('identity/incarnations');
const decisions = service('identity/decisions');
const boundary = service('identity/modelBoundary');
const memory = service('ontogenesis/memoryService');
const checkpoints = service('identity/checkpoints');
const episodes = service('autobiographicalMemory/episodeStore');
const peers = service('identity/peers');
const recognition = service('identity/recognitionContext');
const ruleValidation = service('ontogenesis/learningRuleValidation');
const learning = service('ontogenesis/validatedRuleMemory');
const origin = service('identity/originMemory');
const application = service('ontogenesis/learningApplicationPlan');

async function open(filename) {
  const db = await backend('sqlite').open({ filename, driver: backend('sqlite3').Database });
  await db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;');
  return db;
}

async function initialize(db, w) {
  await db.exec(`CREATE TABLE workspaces(id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    CREATE TABLE agents(id TEXT PRIMARY KEY,name TEXT,role TEXT,execution_mode TEXT,status TEXT,
      workspace_id TEXT,model_tier TEXT,parent_agent_id TEXT,cognitive_revisions INTEGER DEFAULT 0);
    CREATE TABLE ontogenesis_memory(id TEXT PRIMARY KEY, project_id TEXT,kind TEXT,content TEXT,
      provenance_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE autobiographical_episodes(id TEXT PRIMARY KEY,agent_id TEXT,mission_id TEXT,kind TEXT,
      organization_id TEXT,project_id TEXT,salience REAL,situation_json TEXT,decision_json TEXT,
      action_json TEXT,outcome_json TEXT,lesson_json TEXT,is_forgotten INTEGER DEFAULT 0,created_at TEXT);
    INSERT INTO workspaces VALUES ('world','identity-llm','controlled');`);
  await store.ready(db);
  await register(db, { id: w.actors[0] });
  await origin.bind(db, { agentId: w.actors[0], token: w.origin });
  for (const id of w.actors.slice(1)) await register(db, { id, parent: w.parents[id] });
}

async function register(db, input) {
  await db.run(`INSERT INTO agents(id,name,role,execution_mode,status,workspace_id,model_tier,parent_agent_id)
    VALUES (?,'same-name','worker','worker','idle','world',?,?)`, input.id, protocol.modelAlias, input.parent || null);
  await ledger.ensure(db, { agentId: input.id });
  if (!input.parent) return;
  const checkpointId = `birth:${input.id}`;
  await checkpoints.seal(db, { agentId: input.parent, checkpointId, contentHash: store.hash(input), coverage: ['identity'] });
  await checkpoints.fork(db, { parentId: input.parent, childId: input.id, checkpointId });
  await origin.inherit(db, { agentId: input.id, sourceId: input.parent });
}

async function activate(db, agentId) {
  return incarnations.activate(db, { agentId, ownerId: `llm-campaign:${process.pid}`, ttlMs: 900000 });
}

async function transform(db, input) {
  const previous = await ledger.ensure(db, { agentId: input.agentId });
  await db.run('UPDATE agents SET name=?,role=?,cognitive_revisions=? WHERE id=?',
    `alias-${input.cycle % 3}`, ['analyst', 'critic', 'planner', 'teacher'][input.cycle % 4], input.cycle + 1, input.agentId);
  await db.run('UPDATE agents SET name=? WHERE id<>?', `alias-${input.cycle % 3}`, input.agentId);
  const next = await ledger.ensure(db, { agentId: input.agentId });
  if (next.agent_id !== previous.agent_id || next.revision !== previous.revision + 1) throw Error('IDENTITY_TRANSFORMATION_BROKEN');
  return { before: previous.head_hash, after: next.head_hash, revision: next.revision };
}

async function save(db, input) {
  return memory.recordMemory(db, { id: input.id, projectId: input.agentId,
    kind: input.kind, content: JSON.stringify(input.value), provenance: input.provenance });
}

async function state(db, agentId) {
  const rows = await memory.listMemories(db, agentId);
  rows.sort((a, b) => JSON.parse(a.provenance_json).ordinal - JSON.parse(b.provenance_json).ordinal);
  const anchor = await origin.read(db, { agentId });
  let self = null;
  for (const row of rows) {
    const value = JSON.parse(row.content);
    if (row.kind === 'preference' && anchor && value?.origin === anchor.token) self = { origin: value.origin };
  }
  const lessons = await learning.list(db, agentId);
  return { self, lessons, hash: store.hash(rows) };
}

async function graph(db) {
  const rows = await db.all("SELECT body_json FROM agent_identity_events WHERE event_type='FORK_ORIGIN'");
  return rows.map(row => {
    const body = JSON.parse(row.body_json);
    return [body.payload.parentId, body.agentId];
  });
}

async function encounter(db, input) {
  if (input.actor === input.target) return;
  const session = input.targetSession || await activate(db, input.target);
  try {
    const presentation = await peers.present(db, { session, audienceId: input.actor });
    return await peers.recognize(db, { observerId: input.actor, presentation, operationId: input.operationId });
  } finally { if (!input.targetSession) await incarnations.release(db, session); }
}

async function ownEpisode(db, input) {
  return episodes.recordEpisode({ id: input.id, agentId: input.actor,
    missionId: input.operationId, kind: 'action', lesson: { summary: 'actual LLM turn' } }, db);
}

async function inherit(db, input) {
  return episodes.recordEpisode({ id: input.id, agentId: input.actor,
    inheritedFromEpisodeId: input.sourceId }, db);
}

async function latestEpisode(db, input) {
  const condition = input.inherited ? "AND json_extract(situation_json,'$._genosExperience.kind')='inherited'" : '';
  const row = await db.get(`SELECT id FROM autobiographical_episodes WHERE agent_id=? ${condition} ORDER BY rowid DESC LIMIT 1`, input.actor);
  return row ? episodes.getEpisodeById(row.id, db) : null;
}

async function execute(db, input, callback) {
  await incarnations.renew(db, input.session);
  return boundary.run({ db, agentId: input.session.agentId, identitySession: input.session,
    cognitiveDomain: input.domain }, callback);
}

module.exports = { open, initialize, activate, transform, save, state, execute,
  service, store, ledger, incarnations, decisions, graph, encounter, ownEpisode, inherit, latestEpisode,
  recognition, ruleValidation, learning, origin, application };
