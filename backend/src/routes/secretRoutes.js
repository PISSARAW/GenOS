'use strict';

const express = require('express');
const crypto = require('crypto');
const { getDatabase } = require('../db');
const vault = require('../services/secretVault');
const { requireRole } = require('../middleware/auth');
const { requireTenantScope, scopeSql } = require('../middleware/tenant');
const telemetry = require('../services/telemetryObserver');

const router = express.Router();

async function requireSecretTenant(req, res, next) {
  try {
    await requireTenantScope()(req, res, (error) => {
      if (error) return next(error);
      if (!req.tenant) return res.status(403).json({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'Secrets require an explicit organization and project scope.' } });
      next();
    });
  } catch (error) { next(error); }
}

function secretName(value) {
  const name = String(value || '').trim();
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(name) || name === '.' || name === '..') throw new Error('Secret names may contain letters, numbers, dot, underscore and hyphen.');
  return name;
}

function vaultReference(req, name) {
  return `${req.tenant.organizationId}/${req.tenant.projectId}/${name}`;
}

async function storeSecret(input) {
  const { db, req, name, value } = input;
  const provider = vault.getProvider();
  const id = `secret-${crypto.randomUUID()}`;
  const scope = scopeSql(req);
  const existing = await db.get('SELECT id FROM secrets WHERE name = ? AND organization_id = ? AND project_id = ?', name, ...scope.params);
  if (existing) throw new Error('SECRET_ALREADY_EXISTS');
  const values = provider === 'local' ? vault.encrypt(value) : null;
  const externalRef = provider === 'hashicorp-vault' ? vaultReference(req, name) : null;
  if (externalRef) await vault.writeExternalSecret(externalRef, value);
  await db.run(
    `INSERT INTO secrets (id, name, scope, ciphertext, iv, tag, organization_id, project_id, provider, external_ref)
     VALUES (?, ?, 'project', ?, ?, ?, ?, ?, ?, ?)`,
    id, name, values?.ciphertext || '', values?.iv || '', values?.tag || '', ...scope.params, provider, externalRef
  );
  telemetry.emitEvent({
    eventType: 'IAM_SECRET_STORED', agentId: req.user.keyId || req.user.username, action: 'SECRET_STORE',
    detail: `Secret stored using ${provider}.`, severity: 'info', payload: { secretId: id, provider }
  });
  return { id, name, scope: 'project', provider };
}

router.use(requireSecretTenant);

router.get('/', requireRole(['admin']), async (req, res, next) => {
  try {
    const db = await getDatabase();
    const scope = scopeSql(req);
    const rows = await db.all(`SELECT id, name, scope, provider, created_at, rotated_at FROM secrets WHERE ${scope.clause} ORDER BY name`, ...scope.params);
    res.json(rows);
  } catch (error) { next(error); }
});

router.post('/', requireRole(['admin']), requireTenantScope({ write: true }), async (req, res, next) => {
  try {
    const { name, value } = req.body || {};
    if (typeof value !== 'string' || !value) return res.status(400).json({ error: { code: 'INVALID_SECRET', message: 'A non-empty value is required.' } });
    const stored = await storeSecret({ db: await getDatabase(), req, name: secretName(name), value });
    res.status(201).json(stored);
  } catch (error) {
    if (error.message === 'SECRET_ALREADY_EXISTS') return res.status(409).json({ error: { code: 'SECRET_ALREADY_EXISTS' } });
    if (error.message.startsWith('Secret names')) return res.status(400).json({ error: { code: 'INVALID_SECRET_NAME', message: error.message } });
    next(error);
  }
});

router.get('/:name/value', requireRole(['admin']), async (req, res, next) => {
  try {
    const db = await getDatabase();
    const value = await vault.resolveStoredSecret(db, {
      name: secretName(req.params.name), organizationId: req.tenant.organizationId, projectId: req.tenant.projectId
    });
    if (value === null) return res.status(404).json({ error: { code: 'SECRET_NOT_FOUND' } });
    telemetry.emitEvent({
      eventType: 'IAM_SECRET_RESOLVED', agentId: req.user.keyId || req.user.username, action: 'SECRET_RESOLVE',
      detail: 'A tenant-scoped secret was resolved.', severity: 'info', payload: { secretName: req.params.name }
    });
    res.json({ name: req.params.name, value });
  } catch (error) { next(error); }
});

module.exports = router;
