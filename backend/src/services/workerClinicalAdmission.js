'use strict';

const crypto = require('node:crypto');
const { digest, encode } = require('./biologicalIntegrity');
const ledger = require('./gvxLedgerIntegrity');
const SCHEMA = 'genos.worker-clinical-admission/v1';
const failure = code => Object.assign(new Error(code), { code });
function scopeOf(row) { return { organizationId: row.organization_id, projectId: row.project_id }; }
function mac(record) { ledger.assertSigningKeyConfigured(); return ledger.macEvent(digest(record)); }
function metadata(agent) {
  try { return JSON.parse(agent.metadata_json || '{}'); }
  catch (_) { throw failure('WORKER_CLINICAL_ADMISSION_INVALID'); }
}
function verify(record, expected) {
  if (!record || typeof record !== 'object') throw failure('WORKER_CLINICAL_ADMISSION_REQUIRED');
  const { signature, ...body } = record;
  const matches = body.agentId === expected.agentId && body.missionId === expected.missionId
    && digest(body.scope) === digest(expected.scope);
  if (body.schema !== SCHEMA || !matches || !/^[a-f0-9]{64}$/.test(signature || '')) {
    throw failure('WORKER_CLINICAL_ADMISSION_INVALID');
  }
  if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(mac(body), 'hex'))) {
    throw failure('WORKER_CLINICAL_ADMISSION_INVALID');
  }
  return record;
}
async function source(db, record) {
  const scan = await db.get('SELECT rowid AS sequence,* FROM immune_events WHERE id=?', record.scan.id);
  if (!scan || digest(scan) !== digest(record.scan) || record.state.agentId !== record.agentId
    || scan.agent_id !== record.agentId || scan.clinical_state_id !== record.state.id
    || digest(record.state) !== record.stateDigest) throw failure('WORKER_CLINICAL_SOURCE_CHANGED');
}
async function subject(db, input) {
  const row = await db.get(`SELECT a.*,w.organization_id,w.project_id FROM agents a
    LEFT JOIN workspaces w ON w.id=a.workspace_id WHERE a.id=?`, input.agent.id);
  if (!row || row.workspace_id !== input.agent.workspace_id) throw failure('WORKER_GENOME_SCOPE_MISMATCH');
  return row;
}
async function persist(db, input) {
  const encoded = JSON.stringify({ ...metadata(input.agent), clinicalAdmission: input.record });
  const result = await db.run(`UPDATE agents SET metadata_json=? WHERE id=? AND metadata_json=? AND status!='running'`,
    encoded, input.agent.id, input.agent.metadata_json);
  if (result.changes !== 1) throw failure('WORKER_CLINICAL_ADMISSION_CONFLICT');
  input.agent.metadata_json = encoded;
}
function deadline(mission, issuedAt) {
  const duration = mission.timeoutMs || mission.executionBudget?.latencyMs || 1800000;
  if (!Number.isFinite(duration) || duration <= 0) throw failure('WORKER_CLINICAL_DEADLINE_INVALID');
  return new Date(Date.parse(issuedAt) + duration).toISOString();
}
async function admit(db, input) {
  const row = await subject(db, input);
  const checked = await require('./medical/missionQuarantineGate').inspectMissionDispatchAllowed(db, row.id);
  const scan = await db.get('SELECT rowid AS sequence,* FROM immune_events WHERE id=? AND agent_id=?', checked.scanRef, row.id);
  if (!scan) throw failure('WORKER_CLINICAL_SCAN_REQUIRED');
  const issuedAt = new Date().toISOString();
  const body = { schema: SCHEMA, agentId: row.id, missionId: input.mission.missionId || null,
    scope: scopeOf(row), checked: true, detectionCount: checked.detectionCount,
    issuedAt, validUntil: deadline(input.mission, issuedAt), state: checked.state,
    stateDigest: digest(checked.state), scan };
  const record = { ...body, signature: mac(body) };
  await persist(db, { agent: row, record });
  input.agent.metadata_json = row.metadata_json;
  input.mission.clinicalAdmission = record;
  return record;
}
function fromAgent(agent, missionId) {
  const record = metadata(agent).clinicalAdmission;
  return record ? verify(record, { agentId: agent.id, missionId, scope: scopeOf(agent) }) : null;
}
async function ensure(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS worker_clinical_admissions (
    run_id TEXT PRIMARY KEY,agent_id TEXT NOT NULL,mission_id TEXT NOT NULL,
    record_digest TEXT NOT NULL,record_json TEXT NOT NULL);`);
}
async function bindRun(db, input) {
  const record = input.mission.clinicalAdmission;
  if (!record) return {};
  verify(record, { agentId: input.agentId, missionId: input.mission.missionId || null, scope: record.scope });
  await source(db, record);
  await assertCurrent(db, { record });
  await ensure(db);
  const hash = digest(record), serialized = encode(record);
  await db.run(`INSERT OR IGNORE INTO worker_clinical_admissions
    (run_id,agent_id,mission_id,record_digest,record_json) VALUES(?,?,?,?,?)`,
  input.runId, input.agentId, record.missionId, hash, serialized);
  const row = await db.get('SELECT record_digest,record_json FROM worker_clinical_admissions WHERE run_id=?', input.runId);
  if (row?.record_digest !== hash || row.record_json !== serialized) throw failure('WORKER_CLINICAL_ADMISSION_CONFLICT');
  return { clinicalAdmissionHash: hash };
}
async function verifyRun(db, input) {
  const exists = await db.get("SELECT name FROM sqlite_master WHERE name='worker_clinical_admissions'");
  if (!exists) throw failure('WORKER_CLINICAL_ADMISSION_REQUIRED');
  const row = await db.get('SELECT * FROM worker_clinical_admissions WHERE run_id=?', input.runId);
  if (!row || row.agent_id !== input.agentId || row.mission_id !== input.missionId) {
    throw failure('WORKER_CLINICAL_ADMISSION_REQUIRED');
  }
  const record = verify(JSON.parse(row.record_json), input);
  if (digest(record) !== row.record_digest) throw failure('WORKER_CLINICAL_ADMISSION_INVALID');
  await source(db, record);
  await assertCurrent(db, { record, at: input.at, historical: Boolean(input.at) });
  return { record, hash: row.record_digest };
}
async function assertCurrent(db, input) {
  const at = input.at || new Date().toISOString(), record = input.record;
  if (Date.parse(at) < Date.parse(record.issuedAt) || Date.parse(at) > Date.parse(record.validUntil)) {
    throw failure('WORKER_CLINICAL_ADMISSION_EXPIRED');
  }
  const revoked = await db.get(`SELECT id FROM immune_events WHERE agent_id=? AND rowid>?
    AND event_type='quarantine_initiated' AND datetime(created_at)<=datetime(?) LIMIT 1`,
  record.agentId, record.scan.sequence, at);
  if (revoked) throw failure('WORKER_CLINICAL_ADMISSION_REVOKED');
  if (!input.historical) await currentState(db, record.agentId);
}
async function currentState(db, agentId) {
  const row = await db.get(`SELECT a.status,a.isolation_mode,c.cell_cycle_state FROM agents a
    JOIN clinical_states c ON c.agent_id=a.id WHERE a.id=?`, agentId);
  if (!row || row.cell_cycle_state === 'arrested' || row.isolation_mode === 'Quarantine'
    || row.status === 'quarantined') throw failure('WORKER_CLINICAL_ADMISSION_REVOKED');
}
async function assertRun(db, input) {
  if (!input.envelope.clinicalAdmissionHash) return;
  const result = await verifyRun(db, { runId: input.runId, agentId: input.agentId,
    missionId: input.envelope.missionId, scope: { organizationId: input.envelope.scope.organizationId,
      projectId: input.envelope.scope.projectId } });
  if (result.hash !== input.envelope.clinicalAdmissionHash) throw failure('WORKER_CLINICAL_ADMISSION_INVALID');
  if (input.mission?.clinicalAdmission && digest(input.mission.clinicalAdmission) !== result.hash) {
    throw failure('WORKER_CLINICAL_ADMISSION_INVALID');
  }
}

module.exports = { SCHEMA, admit, fromAgent, verify, verifyRun, bindRun, assertRun };
