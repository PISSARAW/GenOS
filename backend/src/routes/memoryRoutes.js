/**
 * GenOS Memory & Experience Routes
 */

const express = require('express');
const router = express.Router();
const memoryController = require('../controllers/memoryController');
const { requireTenantScope } = require('../middleware/tenant');

async function requireMemoryTenant(req, res, next) {
	await requireTenantScope()(req, res, (error) => {
		if (error) return next(error);
		if (!req.tenant) return res.status(403).json({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'Memory operations require an explicit organization and project scope.' } });
		next();
	});
}

router.use(requireMemoryTenant);

router.get('/search', memoryController.search);
router.post('/search', memoryController.search);
router.post('/cherry-pick', memoryController.cherryPick);
router.post('/counterfactual', memoryController.counterfactual);
router.post('/vesicle', memoryController.generateVesicle);
router.post('/ingest', memoryController.ingestMemory);
router.post('/sleep', memoryController.sleepCycle);
router.post('/prune', memoryController.pruneSynapses);

module.exports = router;
