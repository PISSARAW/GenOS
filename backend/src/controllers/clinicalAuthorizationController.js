'use strict';
const { getDatabase } = require('../db');
const { missionBelongsToTenant } = require('./biologicalReceiptController');
const ledger = require('../services/medical/therapyAuthorizationService');
async function issue(req,res,next) {
  try {
    const db = await getDatabase();
    const missionId = req.body?.missionId;
    if (!await missionBelongsToTenant(db,missionId,req.tenant)) return res.status(404).json({ error: 'Mission not found' });
    const authorization = await ledger.issueAuthorization(db,{ missionId,cellId:req.body.cellId,therapy:req.body.therapy,
      approved:req.body.approved,actor:req.user,tenant:req.tenant });
    return res.status(201).json({ authorization });
  } catch (error) { return next(error); }
}

async function inspect(req,res,next) {
  try {
    const db = await getDatabase();
    const authorization = await ledger.inspectAuthorization(db, {
      authorizationId: req.params.authorizationId, tenant: req.tenant,
    });
    if (!authorization) return res.status(404).json({ error: 'Clinical authorization not found' });
    return res.json({ authorization });
  } catch (error) { return next(error); }
}

async function revoke(req,res,next) {
  try {
    const db = await getDatabase();
    const authorization = await ledger.revokeAuthorization(db, {
      authorizationId: req.params.authorizationId, tenant: req.tenant, actor: req.user,
    });
    if (!authorization) return res.status(404).json({ error: 'Clinical authorization not found' });
    return res.json({ authorization });
  } catch (error) { return next(error); }
}

module.exports = { issue, inspect, revoke };
