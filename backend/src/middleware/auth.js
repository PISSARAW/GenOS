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
    return { role: 'viewer', permissions: ROLE_PERMISSIONS.viewer, username: 'anonymous_viewer', isAuthenticated: false };
  }

  const rawToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();

  // Validate only the token hash. Public record IDs are identifiers, not secrets.
  try {
    const db = await getDatabase();
    const tokenHash = hashKey(rawToken);
    const keyRecord = await db.get(
      'SELECT * FROM access_keys WHERE key_hash = ? AND is_active = 1',
      tokenHash
    );

    if (keyRecord) {
      let perms = [];
      try {
        perms = JSON.parse(keyRecord.permissions || '[]');
      } catch (e) {
        perms = [];
      }
      const rolePerms = ROLE_PERMISSIONS[keyRecord.role] || [];
      const combinedPerms = Array.from(new Set([...rolePerms, ...perms]));

      return {
        role: keyRecord.role,
        permissions: combinedPerms,
        username: keyRecord.label || 'operator',
        keyId: keyRecord.id,
        isAuthenticated: true
      };
    }
  } catch (err) {
    console.error('[Auth] Error querying access keys:', err.message);
  }

  return { role: 'viewer', permissions: ROLE_PERMISSIONS.viewer, username: 'anonymous_viewer', isAuthenticated: false };
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

module.exports = {
  ROLE_PERMISSIONS,
  resolveUserFromHeaders,
  requirePermission,
  requireRole,
  hashKey
};
