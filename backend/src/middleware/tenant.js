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
  const project = await db.get('SELECT id, organization_id, status FROM projects WHERE id = ?', projectId);
  if (!project || project.organization_id !== organizationId) return null;
  if (user.permissions?.includes('all')) return { organizationId, projectId, principalId: principalId(user), status: project.status || 'active', user };
  const principal = principalId(user);
  // Project membership is the gate for a project scope: organization
  // membership alone never grants access to a project (least privilege), but
  // unlike the previous INNER-JOIN-in-disguise it is not required to hold an
  // organization row either — a direct project member resolves without one.
  const projectMembership = await db.get(
    `SELECT role FROM project_memberships
      WHERE project_id = ? AND principal_id = ?`,
    projectId, principal
  );
  if (!projectMembership) return null;
  const orgMembership = await db.get(
    `SELECT role FROM organization_memberships
      WHERE principal_id = ? AND organization_id = ?`,
    principal, organizationId
  );
  const role = projectMembership.role || orgMembership?.role;
  if (!role) return null;
  return { organizationId, projectId, principalId: principal, role, status: project.status || 'active', user };
}

function canWriteScope(write, scope) {
  return !write || ['owner', 'admin', 'member'].includes(scope.role) || scope.user?.permissions?.includes('all');
}

function requireTenantScope({ write = false } = {}) {
  return async (req, res, next) => {
    try {
      const user = req.user || await resolveUserFromHeaders(req.headers);
      req.user = user;
      if (!user?.isAuthenticated) {
        return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      }
      const scope = await resolveTenant(req);
      if (!scope) {
        if (await hasGlobalBypass(req)) { req.tenant = null; return next(); }
        return res.status(403).json({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'A valid organization and project scope is required' } });
      }
      if (!canWriteScope(write, scope)) {
        return res.status(403).json({ error: { code: 'TENANT_WRITE_FORBIDDEN', message: 'Project membership is read-only' } });
      }
      if (write && scope.status === 'archived') {
        return res.status(409).json({ error: { code: 'PROJECT_ARCHIVED', message: 'Archived projects are read-only.' } });
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
