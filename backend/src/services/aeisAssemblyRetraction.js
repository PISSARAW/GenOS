'use strict';

const { createHmac } = require('node:crypto');
const values = require('./trinityProvenanceValues');
const { currentKeyId, keyFor } = require('./epistemicReceiptKeyring');

function failure(code, status = 409) { return Object.assign(new Error(code), { code, status }); }

async function ensure(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS aeis_assembly_retractions (
    assembly_id TEXT PRIMARY KEY REFERENCES aeis_assurance_assemblies(id),
    payload_json TEXT NOT NULL, key_id TEXT NOT NULL, signature TEXT NOT NULL)`);
}

function fingerprint(row) {
  return values.digest({ id: row.id, payload: row.payload_json, manifest: row.manifest_json,
    signature: row.signature, keyId: row.key_id, version: row.signature_version,
    runId: row.run_id, scopeId: row.scope_id });
}

function signature(row) {
  return createHmac('sha256', keyFor(row.key_id))
    .update(['genos.aeis-retraction/v1', row.assembly_id, row.payload_json, row.key_id].join('\0')).digest('hex');
}

async function inspect(db, assembly) {
  const table = await db.get("SELECT name FROM sqlite_master WHERE name='aeis_assembly_retractions'");
  if (!table) return { status: 'active', assemblyHash: fingerprint(assembly) };
  const row = await db.get('SELECT * FROM aeis_assembly_retractions WHERE assembly_id=?', assembly.id);
  if (!row) return { status: 'active', assemblyHash: fingerprint(assembly) };
  if (row.signature !== signature(row)) throw failure('AEIS_RETRACTION_INTEGRITY');
  const item = JSON.parse(row.payload_json);
  if (item.assemblyId !== assembly.id || item.assemblyHash !== fingerprint(assembly)
      || item.runId !== assembly.run_id || item.scopeId !== assembly.scope_id) throw failure('AEIS_RETRACTION_BINDING');
  return { status: 'retracted', ...item, signature: row.signature };
}

function text(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 4096) throw failure('AEIS_RETRACTION_INVALID', 400);
  return value.trim();
}

function requestPayload(input, assembly) {
  return { schema: 'genos.aeis-retraction/v1', assemblyId: assembly.id,
    assemblyHash: text(input.expectedAssemblyHash), runId: assembly.run_id, scopeId: assembly.scope_id,
    actorId: text(input.actorId), rationale: text(input.rationale) };
}

async function scopedAssembly(db, input) {
  if (!input.scope?.organizationId || !input.scope.projectId) throw failure('AEIS_RETRACTION_SCOPE_REQUIRED', 403);
  const row = await db.get(`SELECT s.* FROM aeis_assurance_assemblies s
    JOIN strategy_execution_runs r ON r.id=s.run_id JOIN agents a ON a.id=r.agent_id
    JOIN workspaces w ON w.id=a.workspace_id WHERE s.id=? AND w.organization_id=? AND w.project_id=?`,
  text(input.assemblyId), input.scope.organizationId, input.scope.projectId);
  if (!row) throw failure('AEIS_RETRACTION_NOT_FOUND', 404);
  const runScope = await db.get(`SELECT w.id FROM strategy_execution_runs r JOIN agents a ON a.id=r.agent_id
    JOIN workspaces w ON w.id=a.workspace_id WHERE r.id=?`, row.run_id);
  if (row.scope_id !== [input.scope.organizationId, input.scope.projectId, runScope.id].join(':')) {
    throw failure('AEIS_RETRACTION_NOT_FOUND', 404);
  }
  return row;
}

async function retract(db, input) {
  await ensure(db);
  return require('../db').withTransaction(db, async () => {
    const assembly = await scopedAssembly(db, input);
    await require('./aeisAssemblyStore').readAssembly(db, assembly.id, { historical: true });
    const item = requestPayload(input, assembly);
    if (item.assemblyHash !== fingerprint(assembly)) throw failure('AEIS_RETRACTION_STALE_SUBJECT');
    const previous = await inspect(db, assembly);
    if (previous.status === 'retracted') return replay(previous, item);
    const row = { assembly_id: assembly.id, key_id: currentKeyId(),
      payload_json: JSON.stringify({ ...item, retractedAt: new Date().toISOString() }) };
    await db.run('INSERT INTO aeis_assembly_retractions (assembly_id,payload_json,key_id,signature) VALUES (?,?,?,?)',
      row.assembly_id, row.payload_json, row.key_id, signature(row));
    return inspect(db, assembly);
  });
}

function replay(previous, item) {
  const persisted = Object.fromEntries(Object.keys(item).map(key => [key, previous[key]]));
  if (values.digest(persisted) !== values.digest(item)) throw failure('AEIS_RETRACTION_CONFLICT');
  return previous;
}

function assertActive(state) {
  if (state.status !== 'active') throw failure('AEIS_ASSEMBLY_RETRACTED');
}

module.exports = { inspect, retract, assertActive };
