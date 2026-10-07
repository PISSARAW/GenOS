'use strict';
const router = require('express').Router();
const { getDatabase } = require('../db');
const { requirePermission } = require('../middleware/auth');
const { requireTenantScope } = require('../middleware/tenant');
const store = require('../services/studioProductionStore');
const write = [requirePermission('workspace:write'), requireTenantScope({ write: true })];
function handle(operation) {
  return async (req, res, next) => {
    try {
      const db = await getDatabase();
      await require('../services/studioProductionSchema').ensure(db);
      res.json(await operation(db, { scope: req.tenant, actor: req.user.keyId || req.user.username,
        body: req.body || {}, query: req.query, ...req.params }));
    } catch (error) { next(error); }
  };
}
router.get('/workflows', requirePermission('read'), handle(store.list));
router.post('/releases', ...write, handle(store.freeze));
router.get('/releases/:releaseId', requirePermission('read'), handle(store.inspect));
const deployment = require('../services/studioProductionDeployment');
const review = require('../services/studioProductionReview');
router.post('/releases/:releaseId/reviews', ...write, handle(review.review));
router.get('/workflows/:workflowId/slots/:environment', requirePermission('read'), handle(deployment.inspect));
router.post('/workflows/:workflowId/slots/:environment/publish', ...write, handle(deployment.publish));
router.post('/workflows/:workflowId/slots/:environment/rollback', ...write, handle(deployment.rollback));
router.post('/workflows/:workflowId/slots/:environment/invoke', requirePermission('experiment:run'),
  requireTenantScope({ write: true }), handle(deployment.invoke));
module.exports = { router, handle, write };
