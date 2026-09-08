/**
 * GenOS RBAC & Authentication Middleware
 * Enforces 3-tier access control (admin, operator, viewer).
 */

const crypto = require('crypto');
const { getDatabase } = require('../db');

const ROLE_PERMISSIONS = {
  admin: ['all', 'read', 'workspace:write', 'workspace:delete', 'experiment:write', 'experiment:run', 'swarm:vote', 'swarm:propose', 'mcp:execute_safe', 'mcp:execute_destructive', 'security:manage', 'override_breaker', 'emergency_kill'],
  operator: ['read', 'workspace:write', 'experiment:write', 'experiment:run', 'swarm:vote', 'swarm:propose', 'mcp:execute_safe', 'emergency_kill'],
  viewer: ['read', 'telemetry:read']
};

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

async function resolveUserFromHeaders(headers) {
  const authHeader = headers.authorization || headers['x-access-key'];
  if (!authHeader) {
    // Anonymous callers get no permissions. Every protected route must
    // authenticate; there is deliberately no implicit "viewer" fallback.
    return { role: 'anonymous', permissions: [], username: 'anonymous', isAuthenticated: false };
  }

  const rawToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();

  // Validate only the token hash. Public record IDs are identifiers, not secrets.
  try {
    const db = await getDatabase();
    const tokenHash = hashKey(rawToken);
    const keyRecord = await db.get(
      `SELECT * FROM access_keys
       WHERE key_hash = ? AND is_active = 1
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
      tokenHash
    );

    if (keyRecord) {
      let perms = [];
      try {
        const parsed = JSON.parse(keyRecord.permissions || '[]');
        perms = Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
      } catch (e) {
        perms = [];
      }
      const rolePerms = ROLE_PERMISSIONS[keyRecord.role] || [];
      const combinedPerms = Array.from(new Set([...rolePerms, ...perms]));

      await db.run('UPDATE access_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?', keyRecord.id);
      return {
        role: keyRecord.role,
        permissions: combinedPerms,
        username: keyRecord.label || 'operator',
        keyId: keyRecord.id,
        isAuthenticated: true
      };
    }
    const session = await db.get("SELECT * FROM sessions WHERE token_hash = ? AND revoked = 0 AND expires_at > CURRENT_TIMESTAMP", tokenHash);
    if (session) {
      return { role: session.role, permissions: ROLE_PERMISSIONS[session.role] || ROLE_PERMISSIONS.viewer, username: session.username, keyId: session.id, isAuthenticated: true };
    }
  } catch (err) {
    console.error('[Auth] Error querying access keys:', err.message);
  }

  return { role: 'anonymous', permissions: [], username: 'anonymous', isAuthenticated: false };
}

function requirePermission(permission) {
  return async (req, res, next) => {
    const user = await resolveUserFromHeaders(req.headers);
    req.user = user;

    if (user.permissions.includes('all') || user.permissions.includes(permission)) {
      return next();
    }

    if (!user.isAuthenticated) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required for this operation', details: { requiredPermission: permission } }
      });
    }

    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: `Access denied. Requires permission: ${permission}`, details: { userRole: user.role } }
    });
  };
}

function requireRole(allowedRoles) {
  return async (req, res, next) => {
    const user = await resolveUserFromHeaders(req.headers);
    req.user = user;

    if (user.role === 'admin' || allowedRoles.includes(user.role)) {
      return next();
    }

    if (!user.isAuthenticated) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required for this role', details: { allowedRoles } }
      });
    }

    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: `Forbidden. Role '${user.role}' lacks sufficient privileges`, details: { allowedRoles } }
    });
  };
}

// Endpoints reachable without an Authorization header. Everything else
// requires a valid access key or session; per-route permission checks still
// apply on top of this global gate.
const PUBLIC_PATHS = new Set(['/healthz', '/readyz', '/livez']);
const PUBLIC_PREFIXES = ['/api/auth/', '/api/sso/', '/api/security/csrf'];

async function requireAuthentication(req, res, next) {
  try {
    if (req.method === 'OPTIONS' || PUBLIC_PATHS.has(req.path)) return next();
    if (PUBLIC_PREFIXES.some((prefix) => req.path.startsWith(prefix))) return next();
    const user = await resolveUserFromHeaders(req.headers);
    req.user = user;
    if (!user.isAuthenticated) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication is required to access this endpoint.' } });
    }
    next();
  } catch (error) { next(error); }
}

module.exports = {
  ROLE_PERMISSIONS,
  resolveUserFromHeaders,
  requireAuthentication,
  requirePermission,
  requireRole,
  hashKey
};
