'use strict';
const crypto = require('node:crypto');
const FIELDS = ['authorization_id','mission_id','cell_id','genome_id','genome_fingerprint',
  'cell_state_digest','source_receipt_id','therapy_json','approver_id','expires_at_unix_ms'];
function signAuthorization(auth) {
  const secret = process.env.GENOS_THERAPY_AUTH_SECRET;
  if (!secret?.trim()) throw new Error('Therapy authority unavailable');
  return crypto.createHmac('sha256',secret).update(['genos.therapy-authorization/v1',...FIELDS.map(field => String(auth[field]))].join('\0')).digest('hex');
}
function requireApprover(input) {
  if (input.approved !== true || !input.actor?.isAuthenticated || !input.actor.permissions?.includes('all')) {
    throw Object.assign(new Error('Explicit authorized therapy approval required'), { code: 'THERAPY_AUTHORIZATION_REQUIRED' });
  }
}
async function issueAuthorization(db,input) {
  requireApprover(input);
  const tenant = input.tenant;
  if (!tenant?.organizationId || !tenant?.projectId) throw new Error('Clinical authorization tenant scope required');
  require('./nosologyCatalogService').validateTherapy(input.therapy);
  const cell = await db.get(`SELECT * FROM rust_cell_registry WHERE mission_id=? AND cell_id=?`,input.missionId,input.cellId);
  if (!cell?.genome_id || !cell.genome_fingerprint) throw new Error('Durable clinical cell not found');
  const latest = await db.get(`SELECT MAX(tick) AS tick FROM rust_cell_registry WHERE mission_id=?`,input.missionId);
  if (cell.tick !== latest.tick) throw new Error('Clinical cell is not in the current population');
  const therapy = JSON.stringify(input.therapy);
  if (!therapy || therapy === 'null') throw new Error('Therapy required');
  const auth = { authorization_id: crypto.randomUUID(), mission_id: input.missionId, cell_id: input.cellId,
    genome_id: cell.genome_id, genome_fingerprint: cell.genome_fingerprint,
    cell_state_digest: crypto.createHash('sha256').update(cell.cell_state_json).digest('hex'),
    source_receipt_id: cell.source_receipt_id, therapy_json: therapy,
    approver_id: input.actor.keyId || input.actor.username, expires_at_unix_ms: Date.now()+60000 };
  if (!auth.approver_id) throw new Error('Approver identity required');
  const signed = { ...auth,signature: signAuthorization(auth) };
  await db.run(`INSERT INTO clinical_authorization_ledger
    (authorization_id, mission_id, organization_id, project_id, cell_id, signature,
     authorization_json, approver_id, issued_at_unix_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, signed.authorization_id, signed.mission_id,
  tenant.organizationId, tenant.projectId, signed.cell_id, signed.signature,
  JSON.stringify(signed), signed.approver_id, Date.now());
  return signed;
}

async function inspectAuthorization(db, input) {
  if (!input?.tenant?.organizationId || !input?.tenant?.projectId) return null;
  const row = await db.get(`SELECT authorization_id, mission_id, cell_id, approver_id,
    issued_at_unix_ms, revoked_by, revoked_at_unix_ms FROM clinical_authorization_ledger
    WHERE authorization_id=? AND organization_id=? AND project_id=?`, input.authorizationId,
  input.tenant.organizationId, input.tenant.projectId);
  return ledgerView(row);
}

async function revokeAuthorization(db, input) {
  const tenant = input?.tenant;
  const actor = input?.actor;
  const revokedBy = String(actor?.keyId || actor?.username || '').trim();
  const permitted = actor?.permissions?.includes('security:manage') || actor?.permissions?.includes('all');
  if (!actor?.isAuthenticated || !permitted || !tenant?.organizationId || !tenant?.projectId
      || !input.authorizationId || !revokedBy) {
    throw Object.assign(new Error('Scoped clinical revocation authority required'), { code: 'CLINICAL_REVOCATION_FORBIDDEN' });
  }
  await db.run(`UPDATE clinical_authorization_ledger SET revoked_by=?, revoked_at_unix_ms=?
    WHERE authorization_id=? AND organization_id=? AND project_id=? AND revoked_at_unix_ms IS NULL`,
  revokedBy, Date.now(), input.authorizationId, tenant.organizationId, tenant.projectId);
  return inspectAuthorization(db, input);
}

function ledgerView(row) {
  if (!row) return null;
  return {
    authorizationId: row.authorization_id, missionId: row.mission_id, cellId: row.cell_id,
    approverId: row.approver_id, issuedAtUnixMs: row.issued_at_unix_ms,
    status: row.revoked_at_unix_ms === null ? 'issued_in_backend_ledger' : 'revoked_in_backend_ledger',
    revokedBy: row.revoked_by, revokedAtUnixMs: row.revoked_at_unix_ms,
    scope: 'backend_ledger_only', offlineRustAuthorizationRevoked: false,
  };
}
function authorizeClinicalMutation(agentId,options) {
  const approval = options?.authorization;
  if (!approval || approval.approved !== true || approval.targetAgentId !== agentId
      || !approval.approverId || !approval.authorizationId || approval.expiresAt <= Date.now()) {
    throw Object.assign(new Error('Explicit clinical mutation authorization required'), { code: 'THERAPY_AUTHORIZATION_REQUIRED' });
  }
  const expected = clinicalSignature(approval);
  const actual = Buffer.from(String(approval.signature || ''),'hex');
  const bytes = Buffer.from(expected,'hex');
  if (actual.length !== bytes.length || !crypto.timingSafeEqual(actual,bytes)) throw new Error('Clinical authorization signature invalid');
}
function clinicalSignature(auth) {
  const secret = process.env.GENOS_THERAPY_AUTH_SECRET;
  if (!secret?.trim()) throw new Error('Therapy authority unavailable');
  const payload = ['node-clinical/v1',auth.authorizationId,auth.targetAgentId,auth.approverId,auth.therapyType,auth.expiresAt].join('\0');
  return crypto.createHmac('sha256',secret).update(payload).digest('hex');
}
module.exports = { issueAuthorization, inspectAuthorization, revokeAuthorization,
  signAuthorization,authorizeClinicalMutation,clinicalSignature };
