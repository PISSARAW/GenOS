/**
 * Rust Core Bridge Routes
 *
 * Studio's window onto the real genos-cli: snapshot creation, hallucination
 * analysis, replay and diffing. Mutating operations require write access;
 * analysis stays readable.
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/rustBridgeController');
const biologicalReceiptController = require('../controllers/biologicalReceiptController');
const { requireBiologicalReceiptOrigin } = require('../middleware/biologicalReceiptOrigin');
const { requirePermission } = require('../middleware/auth');
const { requireTenantScope } = require('../middleware/tenant');
const { routeRateLimit } = require('../middleware/routeRateLimit');

async function requireBridgeTenant(req, res, next) {
	await requireTenantScope()(req, res, (error) => {
		if (error) return next(error);
		if (!req.tenant) return res.status(403).json({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'Rust bridge operations require an explicit organization and project scope.' } });
		next();
	});
}
router.use(routeRateLimit, requireBridgeTenant);

router.get('/status', requirePermission('read'), controller.getStatus);
const clinicalAuthorizationController = require('../controllers/clinicalAuthorizationController');
const metabolicPoolController = require('../controllers/metabolicPoolController');
const guardFluxController = require('../controllers/guardFluxController');
router.post('/clinical-authorizations', requirePermission('security:manage'), requireReceiptTenant, clinicalAuthorizationController.issue);
router.get('/clinical-authorizations/:authorizationId', requirePermission('read'), clinicalAuthorizationController.inspect);
router.post('/clinical-authorizations/:authorizationId/revoke', requirePermission('security:manage'), requireReceiptTenant, clinicalAuthorizationController.revoke);
router.post('/clinical-authorizations/:authorizationId/apply', requirePermission('security:manage'), requireReceiptTenant, clinicalAuthorizationController.apply);
router.post('/biological-receipts', requirePermission('experiment:run'), requireReceiptTenant, requireBiologicalReceiptOrigin, biologicalReceiptController.ingest);
router.post('/metabolic-pool/consume', requirePermission('experiment:run'), requireReceiptTenant, metabolicPoolController.consume);
router.post('/guard-flux/apply', requirePermission('experiment:run'), requireReceiptTenant, guardFluxController.apply);
router.get('/biological-receipts/:missionId', requirePermission('read'), biologicalReceiptController.audit);
router.get('/snapshots', requirePermission('read'), controller.listSnapshots);
router.post('/snapshots', requirePermission('workspace:write'), controller.createSnapshot);
router.post('/hallucination/:op(detect|analyze|extract)', requirePermission('read'), controller.runHallucination);
router.post('/hallucination/simulate', requirePermission('experiment:run'), controller.simulateHallucination);
router.post('/replay', requirePermission('experiment:run'), controller.replayBranch);
router.post('/diff', requirePermission('read'), controller.diffSnapshots);
router.post('/models/generate', requirePermission('read'), controller.generateModel);

function requireReceiptTenant(req, res, next) {
	if (!req.tenant) {
		return res.status(403).json({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'Biological receipt ingestion requires an explicit project scope.' } });
	}
	if (!['owner', 'admin', 'member'].includes(req.tenant.role) && !req.tenant.user?.permissions?.includes('all')) {
		return res.status(403).json({ error: { code: 'TENANT_WRITE_FORBIDDEN', message: 'Project membership is read-only.' } });
	}
	if (req.tenant.status === 'archived') {
		return res.status(409).json({ error: { code: 'PROJECT_ARCHIVED', message: 'Archived projects are read-only.' } });
	}
	return next();
}

module.exports = router;
