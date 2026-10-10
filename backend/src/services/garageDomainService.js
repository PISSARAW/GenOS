'use strict';

const config = require('../config/orchestratorConfig');
const { withTransaction } = require('../db');

function denied(code) {
  return Object.assign(new Error(code), { code });
}

function workerKind(row) {
  try { return JSON.parse(row.metadata_json || '{}').workerKind; }
  catch { throw denied('GARAGE_DOMAIN_MANAGER_INVALID'); }
}

async function lineage(db, managerId) {
  const seen = new Set();
  const rows = [];
  let id = managerId;
  while (id && rows.length < 32) {
    if (seen.has(id)) throw denied('GARAGE_DOMAIN_CYCLE');
    seen.add(id);
    const row = await db.get(`SELECT a.id, a.parent_agent_id, a.execution_mode,
      a.workspace_id, a.metadata_json, w.id AS scoped_workspace_id,
      w.organization_id, w.project_id FROM agents a
      LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ?`, id);
    if (!row || (row.workspace_id && !row.scoped_workspace_id)) throw denied('GARAGE_DOMAIN_SCOPE_INVALID');
    rows.push(row);
    if (row.execution_mode === 'orchestrator') return rows.reverse();
    if (row.execution_mode !== 'worker' || workerKind(row) !== 'sub_orchestrator') {
      throw denied('GARAGE_DOMAIN_MANAGER_INVALID');
    }
    id = row.parent_agent_id;
  }
  throw denied('GARAGE_DOMAIN_ROOT_REQUIRED');
}

function scopeFor(row, parent) {
  if (row.workspace_id) return { workspaceId: row.workspace_id,
    organizationId: row.organization_id, projectId: row.project_id };
  if (parent) return { workspaceId: parent.workspace_id,
    organizationId: parent.organization_id, projectId: parent.project_id };
  return { workspaceId: null, organizationId: null, projectId: null };
}

function candidate(row, parent, activeCapacity) {
  const scope = scopeFor(row, parent);
  if (parent && (scope.organizationId !== parent.organization_id || scope.projectId !== parent.project_id)) {
    throw denied('GARAGE_DOMAIN_SCOPE_INVALID');
  }
  return { managerId: row.id, parentId: parent?.manager_id || null,
    rootId: parent?.root_manager_id || row.id, workspaceId: scope.workspaceId,
    organizationId: scope.organizationId, projectId: scope.projectId, activeCapacity };
}

function sameBinding(row, input) {
  return row.parent_manager_id === input.parentId && row.root_manager_id === input.rootId
    && row.workspace_id === input.workspaceId && row.organization_id === input.organizationId
    && row.project_id === input.projectId;
}

async function bind(db, input) {
  await db.run(`INSERT OR IGNORE INTO garage_domains(manager_id, parent_manager_id,
    root_manager_id, workspace_id, organization_id, project_id, active_capacity)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, input.managerId, input.parentId,
  input.rootId, input.workspaceId, input.organizationId, input.projectId, input.activeCapacity);
  const row = await db.get('SELECT * FROM garage_domains WHERE manager_id = ?', input.managerId);
  if (!row || !sameBinding(row, input)) throw denied('GARAGE_DOMAIN_BINDING_CONFLICT');
  return row;
}

async function ensureDomain(db, managerId, activeCapacity = config.maxActiveWorkers()) {
  if (!Number.isSafeInteger(activeCapacity) || activeCapacity < 1) throw denied('GARAGE_DOMAIN_CAPACITY_INVALID');
  return withTransaction(db, async () => {
    const chain = await lineage(db, managerId);
    let parent = null;
    for (const row of chain) {
      const capacity = row.id === managerId ? activeCapacity : config.maxActiveWorkers();
      parent = await bind(db, candidate(row, parent, capacity));
    }
    return parent;
  });
}

async function readDomain(db, managerId) {
  return db.get('SELECT * FROM garage_domains WHERE manager_id = ?', managerId);
}

module.exports = { ensureDomain, readDomain };
