'use strict';

function token(context, field) {
  const value = context[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !value.trim()) throw invalid('INVALID');
  return value.trim();
}

function invalid(reason) {
  const code = `FAILURE_MEMORY_SCOPE_${reason}`;
  return Object.assign(new Error(code), { code });
}

function validateContainer(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) throw invalid('INVALID');
  if (context.includeGlobal !== undefined && typeof context.includeGlobal !== 'boolean') throw invalid('INVALID');
}

function selection(context = {}, prefix = '') {
  validateContainer(context);
  const organizationId = token(context, 'organizationId');
  const projectId = token(context, 'projectId');
  if (projectId && !organizationId) throw invalid('INCOMPLETE');
  if (!organizationId) {
    return { sql: ` AND (${prefix}organization_id IS NULL AND ${prefix}project_id IS NULL)`, parameters: [] };
  }
  const terms = [`${prefix}organization_id = ?`];
  const parameters = [organizationId];
  if (projectId) { terms.push(`${prefix}project_id = ?`); parameters.push(projectId); }
  let sql = terms.join(' AND ');
  if (context.includeGlobal === true) {
    sql = `(${sql} OR (${prefix}organization_id IS NULL AND ${prefix}project_id IS NULL))`;
  }
  return { sql: ` AND (${sql})`, parameters };
}

module.exports = { selection };
