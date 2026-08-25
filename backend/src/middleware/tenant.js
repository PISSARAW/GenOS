const { getDatabase } = require('../db');
const { resolveUserFromHeaders } = require('./auth');

// Global administrators may act across tenants without explicit scope
// headers. Every other authenticated principal must prove membership of the
// organization/project that owns the targeted resource.
async function hasGlobalBypass(req) {
  const user = req.user || await resolveUserFromHeaders(req.headers);
  req.user = user;
  return Boolean(user?.isAuthenticated && user.permissions?.includes('all'));
}


function principalId(user) {
  return user.keyId || user.username;
}

async function resolveTenant(req) {
  const organizationId = String(req.headers['x-organization-id'] || '').trim();
  const projectId = String(req.headers['x-project-id'] || '').trim();
  if (!organizationId && !projectId) return null;
  if (!organizationId || !projectId) {
    const error = new Error('X-Organization-Id and X-Project-Id must be provided together');
    error.status = 400;
    error.code = 'INCOMPLETE_TENANT_SCOPE';
    throw error;
  }
  const user = req.user || await resolveUserFromHeaders(req.headers);
  const db = await getDatabase();
  const project = await db.get('SELECT id, organization_id FROM projects WHERE id = ?', projectId);
  if (!project || project.organization_id !== organizationId) return null;
  if (user.permissions?.includes('all')) return { organizationId, projectId, principalId: principalId(user), user };
  const membership = await db.get(
    `SELECT COALESCE(pm.role, om.role) AS role
       FROM organization_memberships om
       LEFT JOIN project_memberships pm ON pm.project_id = ? AND pm.principal_id = om.principal_id
      WHERE om.principal_id = ? AND om.organization_id = ?
        AND (pm.project_id IS NOT NULL OR om.role IN ('owner', 'admin'))`,
    projectId, principalId(user), organizationId
  );
  if (!membership) return null;
  return { organizationId, projectId, principalId: principalId(user), role: membership.role, user };
}

function requireTenantScope({ write = false } = {}) {
  return async (req, res, next) => {
    try {
      const scope = await resolveTenant(req);
      if (!scope) {
        if (await hasGlobalBypass(req)) { req.tenant = null; return next(); }
        return res.status(403).json({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'A valid organization and project scope is required' } });
      }
      if (write && !['owner', 'admin', 'member'].includes(scope.role) && !scope.user?.permissions?.includes('all')) {
        return res.status(403).json({ error: { code: 'TENANT_WRITE_FORBIDDEN', message: 'Project membership is read-only' } });
      }
      req.tenant = scope;
      next();
    } catch (error) { next(error); }
  };
}

async function attachTenant(req, res, next) {
  try { req.tenant = await resolveTenant(req); next(); } catch (error) { next(error); }
}

module.exports = { attachTenant, requireTenantScope, resolveTenant };

function scopeSql(req, alias = '') {
  const prefix = alias ? `${alias}.` : '';
  if (!req.tenant) throw new Error('Tenant scope has not been resolved');
  return { clause: `${prefix}organization_id = ? AND ${prefix}project_id = ?`, params: [req.tenant.organizationId, req.tenant.projectId] };
}

module.exports.scopeSql = scopeSql;
