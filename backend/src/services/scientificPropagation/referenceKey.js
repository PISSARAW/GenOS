const crypto = require('node:crypto');

const FIELDS = ['organizationId', 'projectId', 'workspaceId', 'objectType', 'objectId'];

function normalizeRef(ref) {
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) throw new Error('Scientific reference required');
  const normalized = {};
  for (const field of FIELDS) {
    const value = String(ref[field] ?? '').trim();
    if (!value || value.length > 256) throw new Error(`Invalid scientific reference ${field}`);
    normalized[field] = value;
  }
  if (!Number.isSafeInteger(ref.version) || ref.version < 1) {
    throw new Error('Invalid scientific reference version');
  }
  normalized.version = ref.version;
  return normalized;
}

function referenceKey(ref) {
  return crypto.createHash('sha256').update(JSON.stringify(normalizeRef(ref))).digest('hex');
}

module.exports = { normalizeRef, referenceKey };
