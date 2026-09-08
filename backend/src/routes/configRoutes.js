/**
 * GenOS Config Routes
 */

const express = require('express');
const router = express.Router();
const configController = require('../controllers/configController');
const { requirePermission } = require('../middleware/auth');
const { requireTenantScope } = require('../middleware/tenant');

async function requireConfigTenant(req, res, next) {
	await requireTenantScope()(req, res, (error) => {
		if (error) return next(error);
		if (!req.tenant) return res.status(403).json({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'Configuration APIs require an explicit organization and project scope.' } });
		next();
	});
}

router.use(requireConfigTenant);
router.get('/config', requirePermission('read'), configController.getConfig);
router.get('/model', requirePermission('read'), configController.getModelStatus);
router.get('/model/local', requirePermission('read'), configController.getLocalModels);
router.post('/model/test', requirePermission('experiment:run'), configController.testModel);
router.post('/profile', requirePermission('workspace:write'), configController.updateProfile);
router.get('/budget', requirePermission('read'), configController.getBudget);
router.post('/budget', requirePermission('security:manage'), configController.updateBudget);

module.exports = router;
