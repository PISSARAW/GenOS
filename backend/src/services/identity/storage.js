'use strict';

const crypto = require('crypto');
const { migrateAgentIdentity } = require('../../db/migrations/migrateAgentIdentity');
const pending = new WeakMap();

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function fail(code) { throw Object.assign(new Error(code), { code }); }

async function ready(db) {
  if (!db?.exec || !db.all) fail('IDENTITY_TRANSACTION_REQUIRED');
  if (pending.has(db)) {
    await pending.get(db);
    if (await table(db, 'agent_identity_heads')) return;
    pending.delete(db);
  }
  pending.set(db, migrateAgentIdentity(db).catch(error => { pending.delete(db); throw error; }));
  await pending.get(db);
  if (!await table(db, 'agent_identity_heads')) {
    pending.delete(db);
    fail('IDENTITY_STORAGE_UNAVAILABLE');
  }
}

async function table(db, name) {
  return Boolean(await db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", name));
}

async function registration(db, input) {
  const { agent, daemon } = await sources(db, input.agentId);
  const row = agent || daemon;
  const owner = agent ? await workspace(db, row.workspace_id) : await territory(db, row.territory_id);
  if (agent && row.workspace_id && !owner) fail('IDENTITY_WORKSPACE_UNAVAILABLE');
  return descriptor(input, { row, agent: Boolean(agent), owner });
}

async function sources(db, agentId) {
  const agent = await table(db, 'agents') && await db.get('SELECT * FROM agents WHERE id = ?', agentId);
  const daemon = await table(db, 'daemon_runtime_state')
    && await db.get('SELECT * FROM daemon_runtime_state WHERE daemon_id = ?', agentId);
  if (agent && daemon) fail('IDENTITY_REGISTRATION_COLLISION');
  if (!agent && !daemon) fail('IDENTITY_UNREGISTERED');
  return { agent, daemon };
}

function descriptor(input, source) {
  const { row, agent, owner } = source;
  const scope = { organizationId: owner?.organization_id || '@local', projectId: owner?.project_id || '@local' };
  if (input.scope && hash(input.scope) !== hash(scope)) fail('IDENTITY_SCOPE_MISMATCH');
  const kind = agent ? agentKind(row) : 'daemon';
  return { agentId: input.agentId, sourceTable: agent ? 'agents' : 'daemon_runtime_state', kind,
    scope, ...rowFacts(row) };
}

function agentKind(row) {
  return row.execution_mode === 'orchestrator' || /orchestrator/i.test(row.role || '') ? 'orchestrator' : 'worker';
}

function rowFacts(row) {
  return { status: lifecycle(row), parentId: row.parent_agent_id || row.parent_id || null,
    createdAt: row.created_at || null, name: row.name || null,
    role: row.role || 'resident_daemon', model: row.model_tier || null };
}

function lifecycle(row) { return Number(row.is_apoptotic) === 1 ? 'APOPTOTIC' : row.status || row.health; }

async function workspace(db, id) {
  if (!id || !await table(db, 'workspaces')) return null;
  return db.get('SELECT * FROM workspaces WHERE id = ?', id);
}

async function territory(db, id) {
  if (!id || !await table(db, 'daemon_territories')) return null;
  return db.get('SELECT * FROM daemon_territories WHERE id = ?', id);
}

async function head(db, agentId) {
  return db.get('SELECT * FROM agent_identity_heads WHERE agent_id = ?', agentId);
}

function assertActive(registration) {
  if (['terminated', 'apoptosis', 'Apoptosis', 'APOPTOTIC', 'blocked'].includes(registration.status)) fail('IDENTITY_TERMINAL');
}

module.exports = { canonical, hash, fail, ready, registration, head, assertActive, table };
