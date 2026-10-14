'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../db');

function isProductionOverride(req) {
  const reason = req.body?.overrideReason;
  return req.body?.force === true && typeof reason === 'string' && reason.trim().length >= 12 && reason.length <= 2000;
}

function validateForceOverride(req, environment) {
  if (req.body?.force !== true) return null;
  if (environment !== 'production') return { code: 'INVALID_OVERRIDE_ENVIRONMENT', message: 'Force override is only valid for production promotion.' };
  if (!isProductionOverride(req)) return { code: 'INVALID_OVERRIDE_REASON', message: 'overrideReason must contain 12 to 2000 non-whitespace characters.' };
  if (!req.user?.keyId && !req.user?.username) return { code: 'OVERRIDE_ACTOR_REQUIRED', message: 'Authenticated actor identity is required for a force override.' };
  return null;
}

function buildForceOverrideReceipt(req, releaseId, scope) {
  return {
    id: `release-override-${crypto.randomUUID()}`, releaseId,
    organizationId: scope.params[0], projectId: scope.params[1],
    actorId: req.user.keyId || req.user.username,
    reason: req.body.overrideReason.trim(), approvedAt: new Date().toISOString()
  };
}

async function persistOverrideReceipt(tx, receipt) {
  await tx.run(`INSERT INTO release_force_promotion_receipts
    (id, release_id, organization_id, project_id, actor_id, reason, approved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, receipt.id, receipt.releaseId, receipt.organizationId,
  receipt.projectId, receipt.actorId, receipt.reason, receipt.approvedAt);
}

async function updateReleaseEnvironment(db, options) {
  const { releaseId, environment, scope, override } = options;
  return withTransaction(db, async (tx) => {
    const updated = await tx.run(`UPDATE releases SET environment = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND ${scope.clause}`, environment, 'active', releaseId, ...scope.params);
    if (updated.changes !== 1) return { error: { code: 'RELEASE_STATE_CHANGED', message: 'Release changed before promotion could be applied.' } };
    if (override) await persistOverrideReceipt(tx, override);
    return { id: releaseId, status: 'active', environment, ...(override ? { overrideReceiptId: override.id } : {}) };
  });
}

module.exports = { isProductionOverride, validateForceOverride, buildForceOverrideReceipt, updateReleaseEnvironment };
