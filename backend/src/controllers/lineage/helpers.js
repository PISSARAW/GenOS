/**
 * Shared helpers for the GenOS Lineage DAG & Genome controller modules.
 */

function workspaceScope(req, alias = 'w') {
  const prefix = alias ? `${alias}.` : '';
  return req.tenant
    ? { clause: `${prefix}organization_id = ? AND ${prefix}project_id = ?`, params: [req.tenant.organizationId, req.tenant.projectId] }
    : { clause: `${prefix}organization_id IS NULL AND ${prefix}project_id IS NULL`, params: [] };
}

function loadAgentForScope(db, scope, id) {
  return db.get(`SELECT a.* FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ? AND ${scope.clause}`, id, ...scope.params);
}

function firstTrimmed(...values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

function readString(body, key, fallback = '') {
  return String(body?.[key] || fallback).trim();
}

function orDefault(value, fallback) {
  return value || fallback;
}

function nullish(value, fallback) {
  return value ?? fallback;
}

function countOf(row) {
  return row?.count || 0;
}

function actorName(req) {
  return req.user?.username || 'agent-operation';
}

function optionalId(row) {
  return row?.id || null;
}

module.exports = {
  workspaceScope,
  loadAgentForScope,
  firstTrimmed,
  readString,
  orDefault,
  nullish,
  countOf,
  actorName,
  optionalId
};
