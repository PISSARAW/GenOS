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
    const missionId = String(req.body?.missionId || '').trim();
    const row = await ledger.authorizationForApplication(db, {
      authorizationId: req.params.authorizationId, missionId, tenant: req.tenant,
    });
    if (!row) return res.status(404).json({ error: { code: 'CLINICAL_AUTHORIZATION_NOT_FOUND' } });
    if (row.revoked_at_unix_ms !== null) {
      return res.status(409).json({ error: { code: 'CLINICAL_AUTHORIZATION_REVOKED' } });
    }
    const claims = JSON.parse(row.authorization_json);
    const matches = claimsMatchLedger(claims, row)
      && claims.mission_id === missionId
      && claims.cell_id === req.body?.cellId
      && claims.signature === req.body?.signature;
    if (!matches || !await missionBelongsToTenant(db, missionId, req.tenant)) {
      return res.status(409).json({ error: { code: 'CLINICAL_AUTHORIZATION_SCOPE_MISMATCH' } });
    }
    return res.json({ authorized: true, authorizationId: row.authorization_id });
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
    return await withTransaction(db, async () => {
      const missionId = String(req.body?.missionId || '').trim();
      const authorization = await ledger.authorizationForApplication(db, {
        authorizationId: req.params.authorizationId, missionId, tenant: req.tenant,
      });
      if (!authorization) return res.status(404).json({ error: 'Clinical authorization not found' });
      if (authorization.revoked_at_unix_ms !== null) {
        return res.status(409).json({ error: { code: 'CLINICAL_AUTHORIZATION_REVOKED', message: 'Revoked clinical authorization cannot be applied online.' } });
      }
      if (!await missionBelongsToTenant(db, missionId, req.tenant)) return res.status(404).json({ error: 'Mission not found' });
      return await runOnlineClinicalApplication({ req, res, authorization });
    });
  } catch (error) { return next(error); }
}

async function runOnlineClinicalApplication(input) {
  const { req, res, authorization } = input;
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
      root, envOverrides: clinicalCliEnvironment(req),
    });
    if (!run.ok) return res.status(502).json({ error: { code: 'CLINICAL_RUST_EXECUTION_FAILED', message: run.stderr?.trim() || run.error || 'Rust clinical executor failed.' } });
    return res.json({ operation: 'clinical_apply', missionId: claims.mission_id,
      authorizationId: authorization.authorization_id, rust: run.json ?? run.stdout?.trim() ?? null });
  } finally {
    await fs.rm(files.path, { force: true });
  }
}

function clinicalCliEnvironment(req) {
  const authorization = String(req.headers.authorization || '');
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  return {
    GENOS_THERAPY_AUTH_SECRET: process.env.GENOS_THERAPY_AUTH_SECRET,
    GENOS_CLINICAL_BACKEND_URL: process.env.GENOS_BACKEND_URL
      || process.env.GENOS_API_URL || 'http://127.0.0.1:4000',
    GENOS_CLINICAL_AUTH_TOKEN: token,
    GENOS_CLINICAL_ORGANIZATION_ID: req.tenant.organizationId,
    GENOS_CLINICAL_PROJECT_ID: req.tenant.projectId,
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

module.exports = { issue, inspect, revoke, validateForCli, apply };
