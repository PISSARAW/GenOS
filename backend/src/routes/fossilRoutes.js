const express = require('express');
const router = express.Router();
const controller = require('../controllers/fossilController');
const { requirePermission } = require('../middleware/auth');
const { requireTenantScope } = require('../middleware/tenant');
const { asyncHandler } = require('../middleware/asyncHandler');

async function requireScopedTenant(req, res, next) {
  await requireTenantScope()(req, res, (error) => {
    if (error) return next(error);
    if (!req.tenant) return res.status(403).json({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'Fossil access requires an explicit organization and project scope.' } });
    next();
  });
}

router.use(requireScopedTenant);
router.get('/', requirePermission('read'), asyncHandler(controller.list));
router.get('/strata', requirePermission('read'), asyncHandler(controller.strata));
router.post('/', requirePermission('workspace:write'), requireTenantScope({ write: true }), asyncHandler(controller.record));
router.get('/:id', requirePermission('read'), asyncHandler(controller.getById));
router.post('/:id/excavate', requirePermission('read'), asyncHandler(controller.excavate));
router.get('/:id/decode', requirePermission('read'), asyncHandler(controller.decode));

module.exports = router;
