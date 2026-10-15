'use strict';

const { getDatabase } = require('../db');
const recovery = require('../services/morphogenesis/morphogenesisEpochRecovery');

async function resume(req, res, next) {
  try {
    const scope = req.tenant;
    const checkpoint = await recovery.requestOperatorResume(await getDatabase(), {
      missionId: req.params.missionId,
      organizationId: scope.organizationId,
      projectId: scope.projectId
    });
    return res.json({ checkpoint });
  } catch (error) {
    if (error.code === 'MORPHOGENESIS_RESUME_NOT_REQUIRED') {
      return res.status(409).json({ error: { code: error.code, message: error.message } });
    }
    if (error.code === 'MORPHOGENESIS_CHECKPOINT_SCOPE_CONFLICT') {
      return res.status(404).json({ error: { code: 'MORPHOGENESIS_CHECKPOINT_NOT_FOUND', message: 'Checkpoint not found in this tenant scope.' } });
    }
    return next(error);
  }
}

module.exports = { resume };
