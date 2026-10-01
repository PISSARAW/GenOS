'use strict';
const { getDatabase } = require('../db');
const { missionBelongsToTenant } = require('./biologicalReceiptController');
const { issueAuthorization } = require('../services/medical/therapyAuthorizationService');
async function issue(req,res,next) {
  try {
    const db = await getDatabase();
    const missionId = req.body?.missionId;
    if (!await missionBelongsToTenant(db,missionId,req.tenant)) return res.status(404).json({ error: 'Mission not found' });
    const authorization = await issueAuthorization(db,{ missionId,cellId:req.body.cellId,therapy:req.body.therapy,
      approved:req.body.approved,actor:req.user });
    return res.status(201).json({ authorization });
  } catch (error) { return next(error); }
}
module.exports = { issue };
