'use strict';

const { normalizeRef } = require('./referenceKey');

async function referenceStatus(db, input) {
  const ref = normalizeRef(input);
  const row = await db.get(`SELECT status FROM scientific_references
    WHERE organization_id = ? AND project_id = ? AND workspace_id = ?
      AND object_type = ? AND object_id = ? AND version = ?`,
  ref.organizationId, ref.projectId, ref.workspaceId,
  ref.objectType, ref.objectId, ref.version);
  return row?.status || null;
}

module.exports = { referenceStatus };
