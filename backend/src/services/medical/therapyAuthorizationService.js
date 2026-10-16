'use strict';
const crypto = require('node:crypto');
const CLINICAL_CLAIM_LEASE_MS = 60_000;
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
  const context = await authorizationContext(db, input);
  const signed = createAuthorization(input, context);
  await storeAuthorization(db, signed, context.tenant);
  return signed;
}

async function authorizationContext(db, input) {
  const tenant = input.tenant;
  if (!tenant?.organizationId || !tenant?.projectId) throw new Error('Clinical authorization tenant scope required');
  require('./nosologyCatalogService').validateTherapy(input.therapy);
  const cell = await db.get(`SELECT * FROM rust_cell_registry WHERE mission_id=? AND cell_id=?`,input.missionId,input.cellId);
  if (!cell?.genome_id || !cell.genome_fingerprint) throw new Error('Durable clinical cell not found');
  const latest = await db.get(`SELECT MAX(tick) AS tick FROM rust_cell_registry WHERE mission_id=?`,input.missionId);
  if (cell.tick !== latest.tick) throw new Error('Clinical cell is not in the current population');
  const runtime = await db.get(`SELECT rust_mission_id FROM biological_execution_missions WHERE mission_id=?`, input.missionId);
  return { tenant, cell, rustMissionId: runtime?.rust_mission_id || input.missionId };
}

function createAuthorization(input, context) {
  const therapy = JSON.stringify(input.therapy);
  if (!therapy || therapy === 'null') throw new Error('Therapy required');
  const auth = { authorization_id: crypto.randomUUID(), mission_id: context.rustMissionId, cell_id: input.cellId,
    genome_id: context.cell.genome_id, genome_fingerprint: context.cell.genome_fingerprint,
    cell_state_digest: crypto.createHash('sha256').update(context.cell.cell_state_json).digest('hex'),
    source_receipt_id: context.cell.source_receipt_id, therapy_json: therapy,
    approver_id: input.actor.keyId || input.actor.username, expires_at_unix_ms: Date.now()+60000 };
  if (!auth.approver_id) throw new Error('Approver identity required');
  return { ...auth, signature: signAuthorization(auth) };
}

async function storeAuthorization(db, signed, tenant) {
  await db.run(`INSERT INTO clinical_authorization_ledger
    (authorization_id, mission_id, organization_id, project_id, cell_id, signature,
     authorization_json, approver_id, issued_at_unix_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, signed.authorization_id, signed.mission_id,
  tenant.organizationId, tenant.projectId, signed.cell_id, signed.signature,
  JSON.stringify(signed), signed.approver_id, Date.now());
}

async function inspectAuthorization(db, input) {
  if (!input?.tenant?.organizationId || !input?.tenant?.projectId) return null;
  const row = await db.get(`SELECT authorization_id, mission_id, cell_id, approver_id,
    issued_at_unix_ms, revoked_by, revoked_at_unix_ms FROM clinical_authorization_ledger
    WHERE authorization_id=? AND organization_id=? AND project_id=?`, input.authorizationId,
  input.tenant.organizationId, input.tenant.projectId);
  return ledgerView(row);
}

async function authorizationForApplication(db, input) {
  const tenant = input?.tenant;
  if (!tenant?.organizationId || !tenant?.projectId || !input?.missionId) return null;
  return db.get(`SELECT ledger.authorization_id, ledger.mission_id, ledger.cell_id, ledger.signature,
    ledger.authorization_json, ledger.revoked_at_unix_ms, runtime.rust_mission_id
    FROM clinical_authorization_ledger AS ledger
    LEFT JOIN biological_execution_missions AS runtime ON runtime.mission_id=ledger.mission_id
    WHERE ledger.authorization_id=? AND ledger.mission_id=? AND ledger.organization_id=? AND ledger.project_id=?`,
  input.authorizationId, input.missionId, tenant.organizationId, tenant.projectId);
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

function clinicalOperationId(authorizationId) {
  return `clinical-apply:${authorizationId}`;
}

async function claimApplication(db, input) {
  const scoped = clinicalClaimInput(input);
  const authorization = await authorizationForApplication(db, {
    authorizationId: scoped.authorizationId, missionId: input.missionId, tenant: scoped.tenant,
  });
  if (!authorization) return { status: 'not_found' };
  const key = [scoped.tenant.organizationId, scoped.tenant.projectId, scoped.authorizationId, scoped.operationId];
  return claimExistingOrNew(db, { authorization, input, key, scoped });
}

function clinicalClaimInput(input) {
  const tenant = input?.tenant;
  const authorizationId = String(input?.authorizationId || '');
  const operationId = String(input?.operationId || '');
  const claimantId = String(input?.claimantId || '');
  if (!tenant?.organizationId || !tenant?.projectId || !authorizationId
      || operationId !== clinicalOperationId(authorizationId) || !claimantId) {
    throw Object.assign(new Error('Scoped clinical application claim required'), { code: 'CLINICAL_APPLICATION_CLAIM_INVALID' });
  }
  return { tenant, authorizationId, operationId, claimantId };
}

async function claimExistingOrNew(db, input) {
  const { authorization, key, scoped } = input;
  const existing = await db.get(`SELECT operation_id, claimant_id, claim_token, state, attempts,
    lease_until_unix_ms, result_json FROM clinical_authorization_applications
    WHERE organization_id=? AND project_id=? AND authorization_id=? AND operation_id=?`, ...key);
  if (existing) return claimExistingApplication(db, { existing, key, claimantId: scoped.claimantId });
  if (authorization.revoked_at_unix_ms !== null) return { status: 'revoked' };
  return createApplicationClaim(db, { key, claimantId: scoped.claimantId, operationId: scoped.operationId });
}

async function claimExistingApplication(db, input) {
  const { existing, key, claimantId } = input;
  if (existing.state === 'completed') return claimResult(existing, true, false);
  if (existing.claimant_id === claimantId) return claimResult(existing, false, false);
  const now = Date.now();
  if (existing.lease_until_unix_ms > now) {
    return { status: 'in_progress', retryAfterUnixMs: existing.lease_until_unix_ms };
  }
  const claimToken = crypto.randomUUID();
  await db.run(`UPDATE clinical_authorization_applications SET claimant_id=?, claim_token=?,
    attempts=attempts+1, claimed_at_unix_ms=?, lease_until_unix_ms=?
    WHERE organization_id=? AND project_id=? AND authorization_id=? AND operation_id=? AND state='claimed'` ,
  claimantId, claimToken, now, now + CLINICAL_CLAIM_LEASE_MS, ...key);
  return { operationId: key[3], claimToken, status: 'claimed', recovered: true,
    leaseUntilUnixMs: now + CLINICAL_CLAIM_LEASE_MS };
}

async function createApplicationClaim(db, input) {
  const now = Date.now();
  const claimToken = crypto.randomUUID();
  await db.run(`INSERT INTO clinical_authorization_applications
    (organization_id, project_id, authorization_id, operation_id, claimant_id, claim_token,
     state, attempts, claimed_at_unix_ms, lease_until_unix_ms)
    VALUES (?, ?, ?, ?, ?, ?, 'claimed', 1, ?, ?)`,
  ...input.key, input.claimantId, claimToken, now, now + CLINICAL_CLAIM_LEASE_MS);
  return { operationId: input.operationId, claimToken, status: 'claimed', recovered: false,
    leaseUntilUnixMs: now + CLINICAL_CLAIM_LEASE_MS };
}

function claimResult(row, completed, recovered) {
  return { operationId: clinicalOperationIdFromClaim(row), claimToken: row.claim_token,
    status: completed ? 'completed' : 'claimed', recovered,
    leaseUntilUnixMs: row.lease_until_unix_ms, resultJson: row.result_json };
}

function clinicalOperationIdFromClaim(row) {
  return row.operation_id;
}

async function completeApplication(db, input) {
  const scoped = clinicalCompletionInput(input);
  const key = [scoped.tenant.organizationId, scoped.tenant.projectId, scoped.authorizationId, scoped.operationId];
  const claim = await db.get(`SELECT state, claim_token FROM clinical_authorization_applications
    WHERE organization_id=? AND project_id=? AND authorization_id=? AND operation_id=?`, ...key);
  return completeClaim(db, { claim, key, scoped, result: input.result });
}

function clinicalCompletionInput(input) {
  const tenant = input?.tenant;
  const operationId = String(input?.operationId || '');
  if (!tenant?.organizationId || !tenant?.projectId || !input.authorizationId
      || operationId !== clinicalOperationId(input.authorizationId) || !input.claimToken) {
    throw Object.assign(new Error('Scoped clinical application completion required'), { code: 'CLINICAL_APPLICATION_CLAIM_INVALID' });
  }
  return { tenant, authorizationId: input.authorizationId, operationId, claimToken: input.claimToken };
}

async function completeClaim(db, input) {
  const { claim, key, scoped } = input;
  if (!claim) return { status: 'not_found' };
  if (claim.state === 'completed') return { status: 'completed', operationId: scoped.operationId };
  if (claim.claim_token !== scoped.claimToken) return { status: 'claim_lost' };
  const resultJson = input.result === undefined ? null : JSON.stringify(input.result);
  await db.run(`UPDATE clinical_authorization_applications SET state='completed', completed_at_unix_ms=?, result_json=?
    WHERE organization_id=? AND project_id=? AND authorization_id=? AND operation_id=?
      AND state='claimed' AND claim_token=?`, Date.now(), resultJson, ...key, scoped.claimToken);
  return { status: 'completed', operationId: scoped.operationId };
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
module.exports = { issueAuthorization, inspectAuthorization, revokeAuthorization, authorizationForApplication,
  claimApplication, completeApplication, clinicalOperationId,
  signAuthorization,authorizeClinicalMutation,clinicalSignature };
