'use strict';

function scopeSql(req, alias = 'w') {
  if (!req || !req.tenant) return { clause: '1 = 1', params: [] };
  const prefix = alias ? `${alias}.` : '';
  return {
    clause: `${prefix}organization_id = ? AND ${prefix}project_id = ?`,
    params: [req.tenant.organizationId, req.tenant.projectId]
  };
}

module.exports = { scopeSql };
