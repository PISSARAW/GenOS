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
module.exports = { router, handle, write };
