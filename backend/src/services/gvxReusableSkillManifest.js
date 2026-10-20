'use strict';

const { hash } = require('./gvxContracts');

const HASH = /^[a-f0-9]{64}$/;
const ID = /^[a-z0-9][a-z0-9._-]{0,99}$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const PERMISSION = /^[a-z][a-z0-9._:-]{2,127}$/;

function sealSkillManifest(input) {
  const errors = manifestErrors(input);
  if (errors.length) throw skillError('GVX_SKILL_MANIFEST_INVALID', errors);
  const manifest = {
    schema: 'genos.gvx.reusable-skill/v1', skillId: input.skillId, version: input.version,
    artifactHash: input.artifactHash, sourceDomain: input.sourceDomain,
    provenance: normalizedProvenance(input.provenance),
    requestedPermissions: [...new Set(input.requestedPermissions)].sort(),
    rollbackTarget: { ...input.rollbackTarget }
  };
  return Object.freeze({ ...manifest, manifestHash: hash(manifest) });
}

function verifySkillManifest(manifest) {
  if (!manifest || manifest.schema !== 'genos.gvx.reusable-skill/v1') return false;
  const { manifestHash, ...unsigned } = manifest;
  return HASH.test(manifestHash || '') && manifestErrors(unsigned).length === 0
    && hash(unsigned) === manifestHash;
}

function authorizeSkillManifest(manifest, lease, now = Date.now()) {
  if (!verifySkillManifest(manifest) || !validLeaseIdentity(manifest, lease, now)) {
    return { allowed: false, reason: 'skill-lease-invalid' };
  }
  const allowed = new Set(lease.permissions);
  const missingPermissions = manifest.requestedPermissions.filter((item) => !allowed.has(item));
  if (missingPermissions.length) return { allowed: false, reason: 'skill-permission-denied', missingPermissions };
  return { allowed: true, approvalId: lease.approvalId, leaseId: lease.leaseId };
}

function manifestErrors(input) {
  if (!input || typeof input !== 'object') return ['skill-manifest-required'];
  return [...identityErrors(input), ...lineageErrors(input), ...controlErrors(input)];
}

function identityErrors(input) {
  return [!ID.test(input.skillId || '') && 'skill-id-invalid',
    !VERSION.test(input.version || '') && 'skill-version-invalid',
    !HASH.test(input.artifactHash || '') && 'skill-artifact-hash-invalid',
    !ID.test(input.sourceDomain || '') && 'skill-source-domain-invalid'].filter(Boolean);
}

function lineageErrors(input) {
  return validProvenance(input.provenance) ? [] : ['skill-provenance-invalid'];
}

function controlErrors(input) {
  return [!validPermissions(input.requestedPermissions) && 'skill-permissions-invalid',
    !validRollback(input.rollbackTarget, input.version) && 'skill-rollback-target-invalid'].filter(Boolean);
}

function normalizedProvenance(provenance) {
  return { repositoryCommit: provenance.repositoryCommit,
    transformationEventIds: [...new Set(provenance.transformationEventIds)].sort(),
    evidenceEventIds: [...new Set(provenance.evidenceEventIds)].sort() };
}

function validProvenance(value) {
  return Boolean(value && /^[a-f0-9]{40}$/.test(value.repositoryCommit || '')
    && nonEmptyIds(value.transformationEventIds) && nonEmptyIds(value.evidenceEventIds));
}

function nonEmptyIds(values) {
  return Array.isArray(values) && values.length > 0
    && values.every((value) => typeof value === 'string' && value.trim());
}

function validPermissions(values) {
  return Array.isArray(values) && values.length > 0 && values.every((value) => PERMISSION.test(value));
}

function validRollback(target, version) {
  return Boolean(target && VERSION.test(target.version || '') && target.version !== version
    && HASH.test(target.artifactHash || ''));
}

function validLeaseIdentity(manifest, lease, now) {
  return validLeaseBinding(manifest, lease) && validLeaseReceipt(lease)
    && validLeaseExpiry(lease, now);
}

function validLeaseBinding(manifest, lease) {
  return Boolean(lease && lease.skillId === manifest.skillId && lease.version === manifest.version
    && lease.manifestHash === manifest.manifestHash);
}

function validLeaseReceipt(lease) {
  return Boolean(typeof lease.leaseId === 'string' && lease.leaseId.trim()
    && typeof lease.approvalId === 'string' && lease.approvalId.trim()
    && Array.isArray(lease.permissions));
}

function validLeaseExpiry(lease, now) {
  const expiresAt = Date.parse(lease.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

function skillError(code, errors) { return Object.assign(new Error(errors.join(',')), { code, errors }); }

module.exports = { sealSkillManifest, verifySkillManifest, authorizeSkillManifest, manifestErrors };
