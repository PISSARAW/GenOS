const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getDatabase, withTransaction } = require('../db');
const { resolveUserFromHeaders } = require('../middleware/auth');
const runtimeAdapter = require('../services/agentRuntimeAdapter');
const { isPathWithinRoot, resolveWorkspacesRoot } = require('../services/workspaceRegistry');
const jobWorker = require('../services/jobWorker');
const ORGANIZATION_ROLES = new Set(['owner', 'admin', 'member', 'viewer']);
const PROJECT_ROLES = new Set(['viewer', 'member', 'admin']);
const PROJECT_STATUSES = new Set(['active', 'archived']);
function principalOf(user) {
  return user.keyId || user.username;
}
function isGlobalAdmin(user) {
  return Boolean(user.permissions?.includes('all'));
}

function sendError(res, status, error) {
  return res.status(status).json({ error: { code: error.code, message: error.message } });
}

function insertAudit(db, entry) {
  return db.run(
    'INSERT INTO audit_logs (actor,action,resource,decision,reason,payload_json) VALUES (?,?,?,?,?,?)',
    entry.actor, entry.action, entry.resource, 'allowed', entry.reason, JSON.stringify(entry.payload)
  );
}

async function organizationAdmin(db, user, organizationId) {
  if (isGlobalAdmin(user)) return true;
  const membership = await db.get("SELECT role FROM organization_memberships WHERE principal_id=? AND organization_id=? AND role IN ('owner','admin')", principalOf(user), organizationId);
  return Boolean(membership);
}

async function isOrganizationMember(db, user, organizationId) {
  if (isGlobalAdmin(user)) return true;
  const membership = await db.get('SELECT role FROM organization_memberships WHERE organization_id=? AND principal_id=?', organizationId, principalOf(user));
  return Boolean(membership);
}

async function principalExists(db, principalId) {
  const principal = await db.get('SELECT id FROM access_keys WHERE id=? UNION SELECT username AS id FROM users WHERE username=?', principalId, principalId);
  return Boolean(principal);
}

function readMemberInput(body, allowedRoles) {
  const principalId = String(body?.principalId || '').trim();
  const role = String(body?.role || 'viewer').trim();
  if (!principalId || !allowedRoles.has(role)) return null;
  return { principalId, role };
}

function readProjectInput(body) {
  const organizationId = String(body?.organizationId || '').trim();
  const name = String(body?.name || '').trim();
  if (!organizationId || !name) return null;
  return { organizationId, name };
}

function resolveProjectUpdate(body, project) {
  const name = String(body?.name || project.name).trim();
  const status = String(body?.status || project.status || 'active').trim();
  if (!name || !PROJECT_STATUSES.has(status)) return null;
  return { name, status };
}

async function hasOtherOrganizationAdmin(db, organizationId, principalId) {
  const remaining = await db.get("SELECT COUNT(*) AS count FROM organization_memberships WHERE organization_id=? AND role IN ('owner','admin') AND principal_id<>?", organizationId, principalId);
  return Number(remaining?.count || 0) > 0;
}

async function hasOtherProjectAdmin(db, projectId, principalId) {
  const remaining = await db.get("SELECT COUNT(*) AS count FROM project_memberships WHERE project_id=? AND role='admin' AND principal_id<>?", projectId, principalId);
  return Number(remaining?.count || 0) > 0;
}

function sqlPlaceholders(count) {
  return new Array(count).fill('?').join(',');
}

async function collectProjectWorkspaces(db, project) {
  const workspaces = await db.all('SELECT id, path FROM workspaces WHERE organization_id=? AND project_id=?', project.organization_id, project.id);
  const workspaceIds = workspaces.map((workspace) => { return workspace.id; });
  const agents = workspaceIds.length
    ? await db.all(`SELECT id FROM agents WHERE workspace_id IN (${sqlPlaceholders(workspaceIds.length)})`, ...workspaceIds)
    : [];
  return { workspaces, workspaceIds, agents };
}

async function stopWorkspaceAgents(agents) {
  await Promise.all(agents.map((agent) => { return runtimeAdapter.stopMission(agent.id); }));
}

async function deleteProjectRows(db, project, workspaceIds) {
  const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  for (const table of tables) {
    const columns = await db.all(`PRAGMA table_info(${JSON.stringify(table.name)})`);
    if (columns.some((column) => { return column.name === 'project_id'; }) && table.name !== 'projects') {
      await db.run(`DELETE FROM "${table.name.replace(/"/g, '""')}" WHERE project_id=?`, project.id);
    }
  }
  if (workspaceIds.length) {
    const placeholders = sqlPlaceholders(workspaceIds.length);
    await db.run(`DELETE FROM agents WHERE workspace_id IN (${placeholders})`, ...workspaceIds);
    await db.run(`DELETE FROM cryptobiosis_snapshots WHERE workspace_id IN (${placeholders})`, ...workspaceIds);
    await db.run(`DELETE FROM workspaces WHERE id IN (${placeholders})`, ...workspaceIds);
  }
  await db.run('DELETE FROM projects WHERE id=?', project.id);
}

function canonicalPath(candidate) {
  try {
    return fs.realpathSync(candidate);
  } catch (_) {
    return path.resolve(candidate);
  }
}

function removeWorkspaceDirectories(workspaces) {
  const root = canonicalPath(resolveWorkspacesRoot());
  const skippedPaths = [];
  for (const workspace of workspaces) {
    const workspacePath = canonicalPath(workspace.path);
    if (workspacePath === root || !isPathWithinRoot(root, workspacePath, { allowRoot: false })) {
      skippedPaths.push(workspace.path);
      continue;
    }
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
  return skippedPaths;
}

async function deleteProjectResources(db, project) {
  const { workspaces, workspaceIds, agents } = await collectProjectWorkspaces(db, project);
  await stopWorkspaceAgents(agents);
  await withTransaction(db, async () => {
    await deleteProjectRows(db, project, workspaceIds);
  });
  const skippedPaths = removeWorkspaceDirectories(workspaces);
  return { workspaceCount: workspaces.length, stoppedAgentCount: agents.length, skippedPaths };
}

async function listOrganizations(req, res, next) {
  try {
    const user = await resolveUserFromHeaders(req.headers);
    const db = await getDatabase();
    if (isGlobalAdmin(user)) return res.json(await db.all('SELECT * FROM organizations ORDER BY created_at DESC'));
    return res.json(await db.all('SELECT o.* FROM organizations o JOIN organization_memberships om ON om.organization_id=o.id WHERE om.principal_id=? ORDER BY o.created_at DESC', principalOf(user)));
  } catch (error) {
    next(error);
  }
}

async function createOrganization(req, res, next) {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return sendError(res, 400, { code: 'INVALID_ORGANIZATION', message: 'name is required' });
    const user = await resolveUserFromHeaders(req.headers);
    const actor = principalOf(user);
    const db = await getDatabase();
    const id = `org-${crypto.randomUUID()}`;
    await withTransaction(db, async () => {
      await db.run('INSERT INTO organizations(id,name) VALUES(?,?)', id, name);
      await db.run('INSERT INTO organization_memberships(principal_id,organization_id,role) VALUES(?,?,?)', actor, id, 'owner');
      await insertAudit(db, { actor, action: 'ORGANIZATION_CREATE', resource: id, reason: 'Organization created', payload: { name, owner: actor } });
    });
    return res.status(201).json(await db.get('SELECT * FROM organizations WHERE id=?', id));
  } catch (error) {
    next(error);
  }
}

async function listProjects(req, res, next) {
  try {
    const organizationId = String(req.headers['x-organization-id'] || '').trim();
    if (!organizationId) return sendError(res, 400, { code: 'ORGANIZATION_REQUIRED', message: 'X-Organization-Id is required to list projects.' });
    const user = await resolveUserFromHeaders(req.headers);
    const db = await getDatabase();
    if (isGlobalAdmin(user)) return res.json(await db.all('SELECT * FROM projects WHERE organization_id=? ORDER BY name', organizationId));
    const principal = principalOf(user);
    return res.json(await db.all("SELECT DISTINCT p.* FROM projects p LEFT JOIN organization_memberships om ON om.organization_id=p.organization_id AND om.principal_id=? LEFT JOIN project_memberships pm ON pm.project_id=p.id AND pm.principal_id=? WHERE p.organization_id = ? AND (om.role IN ('owner','admin') OR pm.principal_id IS NOT NULL) ORDER BY p.name", principal, principal, organizationId));
  } catch (error) {
    next(error);
  }
}

async function listOrganizationMembers(req, res, next) {
  try {
    const user = await resolveUserFromHeaders(req.headers);
    const db = await getDatabase();
    if (!await isOrganizationMember(db, user, req.params.id)) return sendError(res, 403, { code: 'ORGANIZATION_MEMBERSHIP_REQUIRED', message: 'Organization membership is required' });
    return res.json(await db.all('SELECT principal_id, organization_id, role, created_at FROM organization_memberships WHERE organization_id=? ORDER BY created_at, principal_id', req.params.id));
  } catch (error) {
    next(error);
  }
}

async function upsertOrganizationMember(req, res, next) {
  try {
    const user = await resolveUserFromHeaders(req.headers);
    const db = await getDatabase();
    const actor = principalOf(user);
    if (!await organizationAdmin(db, user, req.params.id)) return sendError(res, 403, { code: 'ORGANIZATION_ADMIN_REQUIRED', message: 'Organization admin membership is required' });
    const member = readMemberInput(req.body, ORGANIZATION_ROLES);
    if (!member) return sendError(res, 400, { code: 'INVALID_MEMBER', message: 'principalId and a valid organization role are required' });
    if (!await principalExists(db, member.principalId) && !isGlobalAdmin(user)) return sendError(res, 400, { code: 'UNKNOWN_PRINCIPAL', message: 'principalId does not identify a known principal' });
    await db.run('INSERT INTO organization_memberships(principal_id,organization_id,role) VALUES(?,?,?) ON CONFLICT(principal_id,organization_id) DO UPDATE SET role=excluded.role', member.principalId, req.params.id, member.role);
    await insertAudit(db, { actor, action: 'ORGANIZATION_MEMBER_UPSERT', resource: req.params.id, reason: 'Organization membership changed', payload: { principalId: member.principalId, role: member.role } });
    return res.status(201).json(await db.get('SELECT principal_id, organization_id, role, created_at FROM organization_memberships WHERE principal_id=? AND organization_id=?', member.principalId, req.params.id));
  } catch (error) {
    next(error);
  }
}

async function deleteOrganizationMember(req, res, next) {
  try {
    const user = await resolveUserFromHeaders(req.headers);
    const db = await getDatabase();
    const actor = principalOf(user);
    if (!await organizationAdmin(db, user, req.params.id)) return sendError(res, 403, { code: 'ORGANIZATION_ADMIN_REQUIRED', message: 'Organization admin membership is required' });
    const target = await db.get('SELECT role FROM organization_memberships WHERE organization_id=? AND principal_id=?', req.params.id, req.params.principalId);
    if (!target) return sendError(res, 404, { code: 'MEMBER_NOT_FOUND', message: 'Organization member not found' });
    const lastAdmin = ['owner', 'admin'].includes(target.role) && !await hasOtherOrganizationAdmin(db, req.params.id, req.params.principalId);
    if (lastAdmin) return sendError(res, 409, { code: 'LAST_ORGANIZATION_ADMIN', message: 'The last organization administrator cannot be removed' });
    await db.run('DELETE FROM organization_memberships WHERE organization_id=? AND principal_id=?', req.params.id, req.params.principalId);
    await insertAudit(db, { actor, action: 'ORGANIZATION_MEMBER_DELETE', resource: req.params.id, reason: 'Organization membership removed', payload: { principalId: req.params.principalId } });
    return res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

async function createProject(req, res, next) {
  try {
    const user = await resolveUserFromHeaders(req.headers);
    const db = await getDatabase();
    const input = readProjectInput(req.body);
    if (!input) return sendError(res, 400, { code: 'INVALID_PROJECT', message: 'organizationId and name are required' });
    if (!await db.get('SELECT id FROM organizations WHERE id=?', input.organizationId)) return sendError(res, 404, { code: 'ORGANIZATION_NOT_FOUND', message: 'Organization not found' });
    if (!await organizationAdmin(db, user, input.organizationId)) return sendError(res, 403, { code: 'ORGANIZATION_ADMIN_REQUIRED', message: 'Organization admin membership is required' });
    if (await db.get('SELECT id FROM projects WHERE organization_id=? AND name=?', input.organizationId, input.name)) return sendError(res, 409, { code: 'PROJECT_EXISTS', message: 'A project with this name already exists in the organization' });
    const id = `project-${crypto.randomUUID()}`;
    await db.run('INSERT INTO projects(id,organization_id,name,status) VALUES(?,?,?,?)', id, input.organizationId, input.name, 'active');
    return res.status(201).json(await db.get('SELECT * FROM projects WHERE id=?', id));
  } catch (error) {
    next(error);
  }
}

async function upsertProjectMember(req, res, next) {
  try {
    const user = await resolveUserFromHeaders(req.headers);
    const db = await getDatabase();
    const project = await db.get('SELECT organization_id FROM projects WHERE id=?', req.params.id);
    if (!project) return sendError(res, 404, { code: 'PROJECT_NOT_FOUND', message: 'Project not found' });
    if (!await organizationAdmin(db, user, project.organization_id)) return sendError(res, 403, { code: 'ORGANIZATION_ADMIN_REQUIRED', message: 'Organization admin membership is required' });
    const member = readMemberInput(req.body, PROJECT_ROLES);
    if (!member) return sendError(res, 400, { code: 'INVALID_MEMBER', message: 'principalId and a valid role (viewer, member, admin) are required' });
    if (!await principalExists(db, member.principalId) && !isGlobalAdmin(user)) return sendError(res, 400, { code: 'UNKNOWN_PRINCIPAL', message: 'principalId does not identify a known principal' });
    await db.run('INSERT INTO project_memberships(principal_id,project_id,role) VALUES(?,?,?) ON CONFLICT(principal_id,project_id) DO UPDATE SET role=excluded.role', member.principalId, req.params.id, member.role);
    return res.status(201).json(await db.get('SELECT * FROM project_memberships WHERE principal_id=? AND project_id=?', member.principalId, req.params.id));
  } catch (error) {
    next(error);
  }
}

async function updateProject(req, res, next) {
  try {
    const user = await resolveUserFromHeaders(req.headers);
    const db = await getDatabase();
    const project = await db.get('SELECT * FROM projects WHERE id=?', req.params.id);
    if (!project) return sendError(res, 404, { code: 'PROJECT_NOT_FOUND', message: 'Project not found' });
    if (!await organizationAdmin(db, user, project.organization_id)) return sendError(res, 403, { code: 'ORGANIZATION_ADMIN_REQUIRED', message: 'Organization admin membership is required' });
    const update = resolveProjectUpdate(req.body, project);
    if (!update) return sendError(res, 400, { code: 'INVALID_PROJECT', message: 'name and status must be valid' });
    const duplicate = await db.get('SELECT id FROM projects WHERE organization_id=? AND name=? AND id<>?', project.organization_id, update.name, req.params.id);
    if (duplicate) return sendError(res, 409, { code: 'PROJECT_EXISTS', message: 'A project with this name already exists in the organization' });
    await db.run('UPDATE projects SET name=?, status=? WHERE id=?', update.name, update.status, req.params.id);
    await db.run('UPDATE workspaces SET is_archived=?, updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND project_id=?', update.status === 'archived' ? 1 : 0, project.organization_id, req.params.id);
    return res.json(await db.get('SELECT * FROM projects WHERE id=?', req.params.id));
  } catch (error) {
    next(error);
  }
}

async function deleteProjectMember(req, res, next) {
  try {
    const user = await resolveUserFromHeaders(req.headers);
    const db = await getDatabase();
    const project = await db.get('SELECT organization_id FROM projects WHERE id=?', req.params.id);
    if (!project) return sendError(res, 404, { code: 'PROJECT_NOT_FOUND', message: 'Project not found' });
    if (!await organizationAdmin(db, user, project.organization_id)) return sendError(res, 403, { code: 'ORGANIZATION_ADMIN_REQUIRED', message: 'Organization admin membership is required' });
    const target = await db.get('SELECT role FROM project_memberships WHERE project_id=? AND principal_id=?', req.params.id, req.params.principalId);
    if (!target) return sendError(res, 404, { code: 'MEMBER_NOT_FOUND', message: 'Project member not found' });
    const lastAdmin = target.role === 'admin' && !await hasOtherProjectAdmin(db, req.params.id, req.params.principalId);
    if (lastAdmin) return sendError(res, 409, { code: 'LAST_PROJECT_ADMIN', message: 'The last project administrator cannot be removed' });
    const result = await db.run('DELETE FROM project_memberships WHERE project_id=? AND principal_id=?', req.params.id, req.params.principalId);
    if (!result.changes) return sendError(res, 404, { code: 'MEMBER_NOT_FOUND', message: 'Project member not found' });
    return res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

async function deleteProject(req, res, next) {
  try {
    const user = await resolveUserFromHeaders(req.headers);
    const db = await getDatabase();
    const project = await db.get('SELECT * FROM projects WHERE id=?', req.params.id);
    if (!project) return sendError(res, 404, { code: 'PROJECT_NOT_FOUND', message: 'Project not found' });
    if (!await organizationAdmin(db, user, project.organization_id)) return sendError(res, 403, { code: 'ORGANIZATION_ADMIN_REQUIRED', message: 'Organization admin membership is required' });
    const cleanup = await deleteProjectResources(db, project);
    return res.json({ success: true, projectId: project.id, ...cleanup });
  } catch (error) {
    next(error);
  }
}

async function restoreProject(req, res, next) {
  try {
    const user = await resolveUserFromHeaders(req.headers);
    const db = await getDatabase();
    const project = await db.get('SELECT * FROM projects WHERE id=?', req.params.id);
    if (!project) return sendError(res, 404, { code: 'PROJECT_NOT_FOUND', message: 'Project not found' });
    if (!await organizationAdmin(db, user, project.organization_id)) return sendError(res, 403, { code: 'ORGANIZATION_ADMIN_REQUIRED', message: 'Organization admin membership is required' });
    await db.run("UPDATE projects SET status='active' WHERE id=?", req.params.id);
    await db.run('UPDATE workspaces SET is_archived=0, updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND project_id=?', project.organization_id, req.params.id);
    return res.json(await db.get('SELECT * FROM projects WHERE id=?', req.params.id));
  } catch (error) {
    next(error);
  }
}

async function listEnvironments(req, res, next) {
  try {
    const db = await getDatabase();
    return res.json(await db.all('SELECT * FROM environments WHERE organization_id = ? ORDER BY name', req.tenant.organizationId));
  } catch (error) {
    next(error);
  }
}

async function countActiveJobs(db, scope, table) {
  const row = await db.get(`SELECT COUNT(*) AS count FROM ${table} WHERE organization_id=? AND project_id=? AND status IN ('queued','running')`, scope.organizationId, scope.projectId);
  return row?.count || 0;
}

async function countRetries(db, scope, table) {
  const row = await db.get(`SELECT COALESCE(SUM(CASE WHEN attempts > 1 THEN attempts - 1 ELSE 0 END), 0) AS count FROM ${table} WHERE organization_id=? AND project_id=? AND status IN ('queued','running')`, scope.organizationId, scope.projectId);
  return Number(row?.count || 0);
}

async function getWorkerMetrics(req, res, next) {
  try {
    if (!req.tenant) return sendError(res, 400, { code: 'TENANT_SCOPE_REQUIRED', message: 'A tenant scope is required for worker metrics.' });
    const db = await getDatabase();
    const scope = req.tenant;
    const [workflowCount, evalCount, modelCount] = await Promise.all([
      countActiveJobs(db, scope, 'workflow_runs'),
      countActiveJobs(db, scope, 'evaluation_jobs'),
      countActiveJobs(db, scope, 'model_jobs')
    ]);
    const [evalRetries, modelRetries] = await Promise.all([
      countRetries(db, scope, 'evaluation_jobs'),
      countRetries(db, scope, 'model_jobs')
    ]);
    const runtime = jobWorker.getWorkerStatus();
    return res.json({
      status: runtime.running ? 'healthy' : 'offline',
      workers: runtime.running ? 1 : 0,
      active: runtime.busy ? 1 : 0,
      queueDepth: workflowCount + evalCount + modelCount,
      retries: evalRetries + modelRetries,
      blocked: 0,
      processId: runtime.processId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  deleteProjectResources,
  listOrganizations,
  createOrganization,
  listProjects,
  listOrganizationMembers,
  upsertOrganizationMember,
  deleteOrganizationMember,
  createProject,
  upsertProjectMember,
  updateProject,
  deleteProjectMember,
  deleteProject,
  restoreProject,
  listEnvironments,
  getWorkerMetrics
};
