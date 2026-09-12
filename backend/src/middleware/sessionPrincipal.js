/**
 * GenOS credential principal builders.
 * Extracted from middleware/auth.js so the middleware stays inside the
 * complexity gate. Sessions resolve to a STABLE principal: memberships are
 * granted to usernames (or access-key ids), never to ephemeral session ids,
 * so the session principal keyId is the username with fallback to the
 * session id when the username is absent.
 */

function anonymousPrincipal() {
  return { role: 'anonymous', permissions: [], username: 'anonymous', isAuthenticated: false };
}

function extractBearerToken(authHeader) {
  const header = String(authHeader || '').trim();
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  return header;
}

function parseExtraPermissions(raw) {
  let parsed = null;
  try {
    parsed = JSON.parse(raw || '[]');
  } catch (_) {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const extra = [];
  for (const item of parsed) {
    if (typeof item === 'string') extra.push(item);
  }
  return extra;
}

function combinePermissions(base, extra) {
  const combined = [];
  const all = base.concat(extra);
  for (const perm of all) {
    if (!combined.includes(perm)) combined.push(perm);
  }
  return combined;
}

function buildKeyPrincipal(keyRecord, rolePerms) {
  const base = Array.isArray(rolePerms) ? rolePerms : [];
  const extra = parseExtraPermissions(keyRecord.permissions);
  return {
    role: keyRecord.role,
    permissions: combinePermissions(base, extra),
    username: keyRecord.label || 'operator',
    keyId: keyRecord.id,
    isAuthenticated: true
  };
}

function resolveSessionPermissions(session, rolePermissions) {
  const table = rolePermissions || {};
  const perms = table[session.role];
  // Unknown roles fail closed (no permissions) instead of inheriting viewer.
  return Array.isArray(perms) ? perms.slice() : [];
}

function buildSessionPrincipal(session, rolePermissions) {
  const stableId = session.username || session.id;
  return {
    role: session.role,
    permissions: resolveSessionPermissions(session, rolePermissions),
    username: session.username || 'operator',
    keyId: stableId,
    sessionId: session.id,
    isAuthenticated: true
  };
}

module.exports = {
  anonymousPrincipal,
  extractBearerToken,
  parseExtraPermissions,
  buildKeyPrincipal,
  buildSessionPrincipal
};
