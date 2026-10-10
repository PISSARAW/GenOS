const crypto = require('crypto');

const MAX_PAYLOAD_BYTES = 16 * 1024 * 1024;
const TABLES = Object.freeze({
  memories: { name: 'episodic_memories', where: 'agent_id = ?' },
  autobiographicalEpisodes: { name: 'autobiographical_episodes', where: 'agent_id = ?' },
  selfModels: { name: 'agent_self_models', where: 'agent_id = ?' },
  decisions: { name: 'genome_decisions', where: 'created_by = ?' },
  synapses: { name: 'memory_synapses', where: 'source_id IN (SELECT id FROM genome_decisions WHERE created_by = ?) OR target_id IN (SELECT id FROM genome_decisions WHERE created_by = ?)', twice: true },
  relations: { name: 'agent_relations', where: 'source_agent_id = ? OR target_agent_id = ?', twice: true }
});

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function encodeRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key,
    Buffer.isBuffer(value) ? { genosBase64: value.toString('base64') } : value]));
}

function decodeValue(value) {
  if (value && typeof value === 'object' && typeof value.genosBase64 === 'string') {
    return Buffer.from(value.genosBase64, 'base64');
  }
  return value;
}

function assertScope(row, scope) {
  const [organizationId = null, projectId = null] = scope.params;
  if (row.organization_id != null && row.organization_id !== organizationId) {
    throw Object.assign(new Error('Snapshot row organization is outside agent scope.'), { code: 'ORGANISM_STATE_SCOPE_MISMATCH', status: 403 });
  }
  if (row.project_id != null && row.project_id !== projectId) {
    throw Object.assign(new Error('Snapshot row project is outside agent scope.'), { code: 'ORGANISM_STATE_SCOPE_MISMATCH', status: 403 });
  }
}

function assertModelTurn(turn) {
  if (!['pending', 'completed', 'failed'].includes(turn.status)) throw new Error('Snapshot model turn status is invalid.');
  if (digestRaw(turn.request_json) !== turn.request_hash) throw new Error('Snapshot model request hash is invalid.');
  if (turn.response_json && digestRaw(turn.response_json) !== turn.response_hash) {
    throw new Error('Snapshot model response hash is invalid.');
  }
}

function digestRaw(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function readRows(db, spec, agentId) {
  const args = spec.twice ? [agentId, agentId] : [agentId];
  const rows = await db.all(`SELECT * FROM ${spec.name} WHERE ${spec.where}`, ...args);
  return rows.map(encodeRow).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

async function capture(db, agentId, scope) {
  const sections = {};
  for (const [name, spec] of Object.entries(TABLES)) {
    sections[name] = await readRows(db, spec, agentId);
  }
  const runtime = await db.get('SELECT * FROM agent_runtime_state WHERE agent_id = ?', agentId);
  sections.runtime = runtime ? encodeRow(runtime) : null;
  const cursor = await db.get('SELECT * FROM telemetry_events WHERE agent_id = ? ORDER BY id DESC LIMIT 1', agentId);
  sections.runtimeCursor = cursor ? encodeRow(cursor) : null;
  sections.modelTurns = (await db.all(
    'SELECT * FROM organism_model_turns WHERE agent_id = ? ORDER BY rowid', agentId
  )).map(encodeRow);
  for (const turn of sections.modelTurns) assertModelTurn(turn);
  await assertCaptureScope(db, { agentId, scope, sections });
  const serialized = JSON.stringify(sections);
  if (Buffer.byteLength(serialized) > MAX_PAYLOAD_BYTES) {
    throw Object.assign(new Error('Persisted organism state exceeds the snapshot limit.'), { code: 'ORGANISM_STATE_TOO_LARGE', status: 413 });
  }
  return { schemaVersion: 3, sections, hash: digest(sections) };
}

async function assertCaptureScope(db, context) {
  const { agentId, scope, sections } = context;
  for (const relation of sections.relations) {
    const peerId = relation.source_agent_id === agentId ? relation.target_agent_id : relation.source_agent_id;
    const peer = await db.get(`SELECT a.id FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id
      WHERE a.id = ? AND ${scope.clause}`, peerId, ...scope.params);
    if (!peer) {
      throw Object.assign(new Error('Related agent is outside the snapshot tenant.'), { code: 'ORGANISM_RELATION_SCOPE_MISMATCH', status: 403 });
    }
  }
  for (const value of Object.values(sections)) {
    for (const row of Array.isArray(value) ? value : value ? [value] : []) assertScope(row, scope);
  }
  await assertSynapsePeers(db, scope, sections);
}

async function assertSynapsePeers(db, scope, sections) {
  const ownDecisions = new Set(sections.decisions.map((row) => row.id));
  for (const synapse of sections.synapses) {
    for (const id of [synapse.source_id, synapse.target_id]) {
      if (ownDecisions.has(id)) continue;
      const peer = await db.get('SELECT * FROM genome_decisions WHERE id = ?', id);
      if (!peer) throw new Error('Snapshot synapse target decision is missing.');
      assertScope(peer, scope);
    }
  }
}

function verify(payload) {
  if (!payload || payload.schemaVersion !== 3 || !payload.sections) return false;
  const json = JSON.stringify(payload.sections);
  return Buffer.byteLength(json) <= MAX_PAYLOAD_BYTES && payload.hash === digest(payload.sections);
}

function assertOwner(name, row, context) {
  const { agentId, decisionIds } = context;
  if (['memories', 'autobiographicalEpisodes', 'selfModels'].includes(name) && row.agent_id !== agentId) {
    throw new Error('Snapshot memory owner mismatch.');
  }
  if (name === 'decisions' && row.created_by !== agentId) throw new Error('Snapshot decision owner mismatch.');
  if (name === 'relations' && ![row.source_agent_id, row.target_agent_id].includes(agentId)) {
    throw new Error('Snapshot relation owner mismatch.');
  }
  if (name === 'synapses' && ![row.source_id, row.target_id].some((id) => decisionIds.has(id))) {
    throw new Error('Snapshot synapse owner mismatch.');
  }
}

async function insertRow(db, table, row) {
  const columns = (await db.all(`PRAGMA table_info(${table})`)).map((column) => column.name);
  const keys = Object.keys(row);
  if (!keys.length || keys.some((key) => !columns.includes(key))) {
    throw new Error(`Snapshot contains unsupported ${table} columns.`);
  }
  const names = keys.map((key) => `"${key}"`).join(', ');
  const marks = keys.map(() => '?').join(', ');
  await db.run(`INSERT INTO ${table} (${names}) VALUES (${marks})`, ...keys.map((key) => decodeValue(row[key])));
}

async function restore(db, agentId, options) {
  const { payload, scope } = options;
  if (!verify(payload)) {
    throw Object.assign(new Error('Persisted organism state hash is invalid.'), { code: 'ORGANISM_STATE_INTEGRITY_FAILED', status: 409 });
  }
  const { sections } = payload;
  validateSections(sections, agentId, scope);
  await verifyRuntimeCursor(db, sections.runtimeCursor);
  await assertSynapsePeers(db, scope, sections);
  const pending = await db.get("SELECT 1 AS active FROM organism_model_turns WHERE agent_id = ? AND status = 'pending' LIMIT 1", agentId);
  if (pending) throw Object.assign(new Error('Model inference is in progress during restore.'), { code: 'ORGANISM_RESTORE_MODEL_PENDING', status: 409 });
  await replacePersistedRows(db, agentId, sections);
  return { modelTurns: sections.modelTurns.length, runtimeRestartRequired: true };
}

function validateSections(sections, agentId, scope) {
  for (const name of [...Object.keys(TABLES), 'modelTurns']) {
    if (!Array.isArray(sections[name])) throw new Error(`Snapshot ${name} section is invalid.`);
  }
  const decisionIds = new Set(sections.decisions.map((row) => row.id));
  for (const name of Object.keys(TABLES)) {
    for (const row of sections[name]) {
      assertOwner(name, row, { agentId, decisionIds });
      assertScope(row, scope);
    }
  }
  validateRuntimeAndModel(sections, agentId, scope);
}

function validateRuntimeAndModel(sections, agentId, scope) {
  if (sections.runtime && sections.runtime.agent_id !== agentId) throw new Error('Snapshot runtime owner mismatch.');
  if (sections.runtimeCursor && sections.runtimeCursor.agent_id !== agentId) throw new Error('Snapshot runtime cursor owner mismatch.');
  if (sections.modelTurns.some((turn) => turn.agent_id !== agentId)) throw new Error('Snapshot model context owner mismatch.');
  if (sections.modelTurns.some((turn) => turn.status === 'pending')) throw new Error('Snapshot contains unfinished model inference.');
  for (const turn of sections.modelTurns) {
    assertScope(turn, scope);
    assertModelTurn(turn);
  }
  if (sections.runtime) assertScope(sections.runtime, scope);
  if (sections.runtimeCursor) assertScope(sections.runtimeCursor, scope);
}

async function verifyRuntimeCursor(db, cursor) {
  if (!cursor) return;
  const current = await db.get('SELECT * FROM telemetry_events WHERE id = ? AND agent_id = ?', cursor.id, cursor.agent_id);
  if (!current || digest(encodeRow(current)) !== digest(cursor)) {
    throw Object.assign(new Error('Runtime event cursor is missing or changed.'), { code: 'ORGANISM_RUNTIME_CURSOR_INVALID', status: 409 });
  }
}

async function replacePersistedRows(db, agentId, sections) {
  for (const name of ['synapses', 'relations', 'memories', 'autobiographicalEpisodes', 'selfModels', 'decisions']) {
    const spec = TABLES[name];
    const args = spec.twice ? [agentId, agentId] : [agentId];
    await db.run(`DELETE FROM ${spec.name} WHERE ${spec.where}`, ...args);
  }
  for (const name of ['memories', 'autobiographicalEpisodes', 'selfModels', 'decisions', 'synapses', 'relations']) {
    for (const row of sections[name]) {
      await insertRow(db, TABLES[name].name, row);
    }
  }
  await db.run('DELETE FROM agent_runtime_state WHERE agent_id = ?', agentId);
  if (sections.runtime) await insertRow(db, 'agent_runtime_state', sections.runtime);
  await db.run('DELETE FROM organism_model_turns WHERE agent_id = ?', agentId);
  for (const turn of sections.modelTurns) await insertRow(db, 'organism_model_turns', turn);
}

module.exports = { capture, verify, restore, digest };
