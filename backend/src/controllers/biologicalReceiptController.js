'use strict';

const { getDatabase } = require('../db');
const { ingestBiologicalReceipt, validateReceipt } = require('../services/biologicalExecutionReceiptService');

async function missionBelongsToTenant(db, missionId, tenant) {
  return db.get(`SELECT m.mission_id FROM missions m
    JOIN mission_agents ma ON ma.mission_id = m.mission_id
    JOIN agents a ON a.id = ma.agent_id
    JOIN workspaces w ON w.id = a.workspace_id
    WHERE m.mission_id = ? AND w.organization_id = ? AND w.project_id = ? LIMIT 1`,
  missionId, tenant.organizationId, tenant.projectId);
}

function clientError(error) {
  return typeof error?.code === 'string' && error.code.startsWith('BIOLOGICAL_RECEIPT_');
}

async function ingest(req, res, next) {
  try {
    const receipt = req.body?.receipt || req.body;
    const normalized = validateReceipt(receipt);
    const db = await getDatabase();
    const mission = await missionBelongsToTenant(db, normalized.mission_id, req.tenant);
    if (!mission) return res.status(404).json({ error: { code: 'MISSION_NOT_FOUND', message: 'Mission is not available in this project.' } });
    const result = await ingestBiologicalReceipt(db, normalized, req.biologicalReceiptOrigin);
    return res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) {
    if (clientError(error)) {
      const status = error.code === 'BIOLOGICAL_RECEIPT_MISSION_NOT_FOUND' ? 404 : 400;
      return res.status(status).json({ error: { code: error.code, message: error.message } });
    }
    return next(error);
  }
}

module.exports = { ingest, missionBelongsToTenant };
