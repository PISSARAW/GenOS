/**
 * Platform approval policy helpers (point #8 — approbations).
 *
 * Pure, side-effect-free checks shared by the platform and strategy
 * controllers:
 * - normalized identity comparison so the separation-of-duties rule cannot
 *   be bypassed by mixing keyId and username forms of the same principal;
 * - sha256 payload integrity hashing;
 * - approval permission resolution (payload permissions win, ['*'] stays the
 *   fallback so legitimate flows without explicit permissions keep working).
 */

const crypto = require('crypto');

function normalizeIdentity(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function decisionIdentities(user) {
  const source = user || {};
  return [normalizeIdentity(source.keyId), normalizeIdentity(source.username)]
    .filter((entry) => entry !== '');
}

function matchesAnyIdentity(value, identities) {
  const expected = normalizeIdentity(value);
  if (!expected) return false;
  const list = Array.isArray(identities) ? identities : [];
  return list.map(normalizeIdentity).indexOf(expected) !== -1;
}

function isSelfApproval(requestedBy, user) {
  return matchesAnyIdentity(requestedBy, decisionIdentities(user));
}

function resolveActorIdentity(user, fallback) {
  const identities = decisionIdentities(user);
  if (identities.length) return identities[0];
  return fallback;
}

function hashPayload(payloadJson) {
  return crypto.createHash('sha256').update(String(payloadJson)).digest('hex');
}

function payloadText(payloadJson) {
  return String(payloadJson || '{}');
}

function payloadHashMatches(storedHash, payloadJson) {
  const expected = normalizeIdentity(storedHash);
  if (!expected) return true;
  return hashPayload(payloadJson) === expected;
}

function parseDecision(body) {
  const input = body || {};
  const approved = input.decision === 'approve';
  return { approved, status: approved ? 'approved' : 'rejected', reason: input.reason || null };
}

function isToolAction(action) {
  return String(action).startsWith('tool:');
}

function isPermissionEntry(entry) {
  return typeof entry === 'string' && entry.trim() !== '';
}

function resolveApprovalPermissions(payload) {
  const source = payload || {};
  const configured = Array.isArray(source.permissions) ? source.permissions.filter(isPermissionEntry) : [];
  if (configured.length) return configured;
  return ['*'];
}

function toolNameFromApproval(approval, payload) {
  const source = payload || {};
  if (typeof source.toolName === 'string' && source.toolName.trim()) return source.toolName.trim();
  return String(approval.action).slice(5);
}

function isTamperBlocked(execution) {
  if (execution === null || execution === undefined) return false;
  return execution.code === 'APPROVAL_PAYLOAD_TAMPERED';
}

module.exports = {
  normalizeIdentity,
  decisionIdentities,
  matchesAnyIdentity,
  isSelfApproval,
  resolveActorIdentity,
  hashPayload,
  payloadText,
  payloadHashMatches,
  parseDecision,
  isToolAction,
  resolveApprovalPermissions,
  toolNameFromApproval,
  isTamperBlocked
};
