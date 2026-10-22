'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { getDatabase, withTransaction } = require('../db');
const { missionBelongsToTenant } = require('./biologicalReceiptController');
const ledger = require('../services/medical/therapyAuthorizationService');
const cli = require('../services/genosCli');
async function issue(req,res,next) {
  try {
    const db = await getDatabase();
    const missionId = req.body?.missionId;
    if (!await missionBelongsToTenant(db,missionId,req.tenant)) return res.status(404).json({ error: 'Mission not found' });
    const authorization = await ledger.issueAuthorization(db,{ missionId,cellId:req.body.cellId,therapy:req.body.therapy,
      approved:req.body.approved,actor:req.user,tenant:req.tenant });
    return res.status(201).json({ authorization });
  } catch (error) { return next(error); }
}

async function inspect(req,res,next) {
  try {
    const db = await getDatabase();
    const authorization = await ledger.inspectAuthorization(db, {
      authorizationId: req.params.authorizationId, tenant: req.tenant,
    });
    if (!authorization) return res.status(404).json({ error: 'Clinical authorization not found' });
    return res.json({ authorization });
  } catch (error) { return next(error); }
}

async function validateForCli(req, res, next) {
  try {
    const db = await getDatabase();
    const result = await validateCliReservation({ db, req });
    return res.status(result.status).json(result.body);
  } catch (error) { return next(error); }
}

async function validateCliReservation(input) {
  const { db, req } = input;
  const missionId = String(req.body?.missionId || '').trim();
  const row = await ledger.authorizationForApplication(db, {
    authorizationId: req.params.authorizationId, missionId, tenant: req.tenant,
  });
  if (!row) return cliValidationFailure(404, 'CLINICAL_AUTHORIZATION_NOT_FOUND');
  if (!await cliAuthorizationScopeMatches({ db, req, row, missionId })) {
    return cliValidationFailure(409, 'CLINICAL_AUTHORIZATION_SCOPE_MISMATCH');
  }
  return resolveCliReservation({ db, req, row, missionId });
}

async function cliAuthorizationScopeMatches(input) {
  const { db, req, row, missionId } = input;
  const claims = JSON.parse(row.authorization_json);
  return claimsMatchLedger(claims, row) && claims.mission_id === missionId
    && claims.cell_id === req.body?.cellId && claims.signature === req.body?.signature
    && missionBelongsToTenant(db, missionId, req.tenant);
}

async function resolveCliReservation(input) {
  const { db, req, row, missionId } = input;
  if (req.body?.claimToken) return validateClaimToken({ db, req, row, missionId });
  if (row.revoked_at_unix_ms !== null) return cliValidationFailure(409, 'CLINICAL_AUTHORIZATION_REVOKED');
  return cliValidationSuccess({ authorized: true, authorizationId: row.authorization_id });
}

async function validateClaimToken(input) {
  const { db, req, row, missionId } = input;
  const reserved = await ledger.validateApplicationReservation(db, {
    authorizationId: row.authorization_id, missionId,
    cellId: req.body.cellId, signature: req.body.signature,
    claimToken: req.body.claimToken, tenant: req.tenant,
  });
  if (!reserved) return cliValidationFailure(409, 'CLINICAL_APPLICATION_CLAIM_LOST');
  return cliValidationSuccess({ authorized: true, authorizationId: row.authorization_id,
    operationId: ledger.clinicalOperationId(row.authorization_id), reservation: true });
}

function cliValidationFailure(status, code) {
  return { status, body: { error: { code } } };
}

function cliValidationSuccess(body) {
  return { status: 200, body };
}

async function claimForCli(req, res, next) {
  try {
    const db = await getDatabase();
    const outcome = await prepareCliClaim({ db, req });
    if (outcome.httpStatus) return res.status(outcome.httpStatus).json(outcome.body);
    return res.json({ authorized: true, authorizationId: outcome.authorizationId, ...outcome.claim });
  } catch (error) { return next(error); }
}

async function prepareCliClaim({ db, req }) {
  const authorizationId = req.params.authorizationId;
  const missionId = String(req.body?.missionId || '').trim();
  const authorization = await ledger.authorizationForApplication(db, {
    authorizationId, missionId, tenant: req.tenant,
  });
  if (!authorization) return claimFailure(404, 'CLINICAL_AUTHORIZATION_NOT_FOUND');
  const claims = JSON.parse(authorization.authorization_json);
  const valid = claimsMatchLedger(claims, authorization)
    && claims.cell_id === req.body?.cellId && claims.signature === req.body?.signature
    && await missionBelongsToTenant(db, missionId, req.tenant);
  if (!valid) return claimFailure(409, 'CLINICAL_AUTHORIZATION_SCOPE_MISMATCH');
  const claim = await withTransaction(db, () => ledger.claimApplication(db, {
    authorizationId, missionId, operationId: req.body?.operationId,
    claimantId: req.body?.claimantId, tenant: req.tenant,
  }));
  return { authorizationId, claim, httpStatus: claimHttpStatus(claim.status),
    body: claimHttpBody(claim) };
}

function claimFailure(httpStatus, code) {
  return { httpStatus, body: { error: { code } } };
}

function claimHttpStatus(status) {
  return { not_found: 404, revoked: 409, in_progress: 409 }[status] || null;
}

function claimHttpBody(claim) {
  if (claim.status === 'in_progress') {
    return { error: { code: 'CLINICAL_APPLICATION_IN_PROGRESS', retryAfterUnixMs: claim.retryAfterUnixMs } };
  }
  const codes = { not_found: 'CLINICAL_AUTHORIZATION_NOT_FOUND', revoked: 'CLINICAL_AUTHORIZATION_REVOKED' };
  return codes[claim.status] ? { error: { code: codes[claim.status] } } : null;
}

async function completeCliApplication(req, res, next) {
  try {
    const db = await getDatabase();
    const result = await withTransaction(db, () => ledger.completeApplication(db, {
      authorizationId: req.params.authorizationId, operationId: req.body?.operationId,
      claimToken: req.body?.claimToken, result: req.body?.result, tenant: req.tenant,
    }));
    if (result.status === 'not_found') return res.status(404).json({ error: { code: 'CLINICAL_APPLICATION_CLAIM_NOT_FOUND' } });
    if (result.status === 'claim_lost') return res.status(409).json({ error: { code: 'CLINICAL_APPLICATION_CLAIM_LOST' } });
    return res.json(result);
  } catch (error) { return next(error); }
}

async function revoke(req,res,next) {
  try {
    const db = await getDatabase();
    const authorization = await withTransaction(db, () => ledger.revokeAuthorization(db, {
      authorizationId: req.params.authorizationId, tenant: req.tenant, actor: req.user,
    }));
    if (!authorization) return res.status(404).json({ error: 'Clinical authorization not found' });
    return res.json({ authorization });
  } catch (error) { return next(error); }
}

async function apply(req, res, next) {
  try {
    const db = await getDatabase();
    const result = await prepareClinicalApplication({ db, req });
    if (result.httpStatus) return res.status(result.httpStatus).json(result.body);
    if (result.cachedResult) return res.json(result.cachedResult);
    return await runOnlineClinicalApplication({ req, res, ...result.execution });
  } catch (error) { return next(error); }
}

async function prepareClinicalApplication({ db, req }) {
  const missionId = String(req.body?.missionId || '').trim();
  const authorization = await ledger.authorizationForApplication(db, {
    authorizationId: req.params.authorizationId, missionId, tenant: req.tenant,
  });
  if (!authorization) return { httpStatus: 404, body: { error: 'Clinical authorization not found' } };
  if (!await missionBelongsToTenant(db, missionId, req.tenant)) {
    return { httpStatus: 404, body: { error: 'Mission not found' } };
  }
  const claims = JSON.parse(authorization.authorization_json);
  if (!claimsMatchLedger(claims, authorization) || claims.signature !== ledger.signAuthorization(claims)) {
    return { httpStatus: 409, body: { error: { code: 'CLINICAL_AUTHORIZATION_LEDGER_MISMATCH' } } };
  }
  return claimOnlineApplication({ db, req, missionId, authorization, claims });
}

async function claimOnlineApplication(input) {
  const { db, req, missionId, authorization, claims } = input;
  const claimantId = randomUUID();
  const claim = await withTransaction(db, () => ledger.claimApplication(db, {
    authorizationId: authorization.authorization_id, missionId,
    operationId: ledger.clinicalOperationId(authorization.authorization_id), claimantId, tenant: req.tenant,
  }));
  const httpStatus = claimHttpStatus(claim.status);
  if (httpStatus) return { httpStatus, body: claimHttpBody(claim) };
  if (claim.status === 'completed' && claim.resultJson) {
    return { cachedResult: { operation: 'clinical_apply', missionId: claims.mission_id,
      authorizationId: authorization.authorization_id, rust: JSON.parse(claim.resultJson) } };
  }
  return { execution: { authorization, claimantId, claim } };
}

async function runOnlineClinicalApplication(input) {
  const { req, res, authorization, claimantId, claim } = input;
  const claims = JSON.parse(authorization.authorization_json);
  if (!claimsMatchLedger(claims, authorization)) {
    return res.status(409).json({ error: { code: 'CLINICAL_AUTHORIZATION_LEDGER_MISMATCH', message: 'Ledger claims do not match the signed clinical authorization.' } });
  }
  const root = cli.studioBridgeRoot();
  const files = await writeAuthorizationFile({ root, tenant: req.tenant,
    authorizationId: authorization.authorization_id, claims });
  try {
    const journal = path.join('biological-receipts', `${safePathPart(claims.mission_id)}.jsonl`);
    const run = await cli.runGenos(['biomimicry', 'therapy', '--agent-id', claims.cell_id,
      '--therapy-type', claims.therapy_json, '--journal', journal, '--authorization-file', files.reference], {
      root, envOverrides: clinicalCliEnvironment(req, claimantId),
    });
    if (!run.ok) return res.status(502).json({ error: { code: 'CLINICAL_RUST_EXECUTION_FAILED', message: run.stderr?.trim() || run.error || 'Rust clinical executor failed.' } });
    const db = await getDatabase();
    const completed = await withTransaction(db, () => ledger.completeApplication(db, {
      authorizationId: authorization.authorization_id,
      operationId: claim.operationId,
      claimToken: claim.claimToken,
      result: run.json,
      tenant: req.tenant,
    }));
    if (completed.status !== 'completed') return res.status(502).json({ error: { code: 'CLINICAL_APPLICATION_COMPLETION_FAILED' } });
    return res.json({ operation: 'clinical_apply', missionId: claims.mission_id,
      authorizationId: authorization.authorization_id, rust: run.json ?? run.stdout?.trim() ?? null });
  } finally {
    await fs.rm(files.path, { force: true });
  }
}

function clinicalCliEnvironment(req, claimantId) {
  const authorization = String(req.headers.authorization || '');
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  return {
    GENOS_THERAPY_AUTH_SECRET: process.env.GENOS_THERAPY_AUTH_SECRET,
    GENOS_CLINICAL_BACKEND_URL: process.env.GENOS_BACKEND_URL
      || process.env.GENOS_API_URL || 'http://127.0.0.1:4000',
    GENOS_CLINICAL_AUTH_TOKEN: token,
    GENOS_CLINICAL_ORGANIZATION_ID: req.tenant.organizationId,
    GENOS_CLINICAL_PROJECT_ID: req.tenant.projectId,
    GENOS_CLINICAL_CLAIMANT_ID: claimantId,
  };
}

function claimsMatchLedger(claims, row) {
  return claims.authorization_id === row.authorization_id
    && claims.mission_id === (row.rust_mission_id || row.mission_id)
    && claims.cell_id === row.cell_id && claims.signature === row.signature;
}

function tenantAuthorizationRoot(root, tenant) {
  return path.join(root, 'tenants', safePathPart(tenant.organizationId), safePathPart(tenant.projectId));
}

function safePathPart(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function writeAuthorizationFile(input) {
  const { root, tenant, authorizationId, claims } = input;
  await fs.mkdir(root, { recursive: true });
  const resolvedRoot = await fs.realpath(root);
  const tenantRoot = tenantAuthorizationRoot(resolvedRoot, tenant);
  const directory = path.join(tenantRoot, 'clinical-authorizations');
  await fs.mkdir(directory, { recursive: true });
  const resolvedDirectory = await fs.realpath(directory);
  if (!resolvedDirectory.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error('Clinical authorization path escaped the tenant bridge root');
  const file = path.join(resolvedDirectory, `${safePathPart(authorizationId)}-${randomUUID()}.json`);
  await fs.writeFile(file, JSON.stringify(claims), { flag: 'wx', mode: 0o600 });
  return { path: file, reference: path.relative(resolvedRoot, file) };
}

module.exports = { issue, inspect, revoke, validateForCli, claimForCli, completeCliApplication, apply };
