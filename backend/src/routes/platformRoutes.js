const express = require('express');
const router = express.Router();
const c = require('../controllers/platformController');
const { requirePermission } = require('../middleware/auth');
const { requireTenantScope } = require('../middleware/tenant');
async function requireApprovalTenant(req, res, next) {
	await requireTenantScope()(req, res, (error) => {
		if (error) return next(error);
		if (!req.tenant) return res.status(403).json({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'Approval operations require an explicit organization and project scope.' } });
		next();
	});
}
router.get('/platform/providers', c.providers);
router.post('/platform/providers', requirePermission('security:manage'), c.registerProvider);
router.post('/platform/route', requirePermission('read'), c.route);
router.get('/platform/model-routing/policies', requirePermission('read'), c.routingPolicies);
router.put('/platform/model-routing/policies/:agentId', requirePermission('security:manage'), requireTenantScope({ write: true }), c.saveRoutingPolicy);
router.get('/platform/causal-graph', c.graph);
router.get('/platform/telemetry/summary', c.telemetrySummary);
router.get('/platform/audit', requirePermission('security:manage'), c.audit);
router.get('/platform/permissions', requirePermission('security:manage'), c.permissions);
router.post('/platform/permissions', requirePermission('security:manage'), c.permissions);
router.post('/platform/tool-calls/validate', requirePermission('mcp:execute_safe'), c.validateTool);
router.post('/platform/incidents/:incidentId/replay', requirePermission('read'), requireTenantScope(), c.replay);
router.post('/platform/incidents/bisect', requirePermission('workspace:write'), requireTenantScope({ write: true }), c.bisect);
router.get('/platform/approvals', requirePermission('security:manage'), requireApprovalTenant, c.approvals);
router.post('/platform/approvals', requirePermission('mcp:execute_safe'), requireApprovalTenant, requireTenantScope({ write: true }), c.approvals);
router.post('/platform/approvals/:id/decision', requirePermission('security:manage'), requireApprovalTenant, requireTenantScope({ write: true }), c.decideApproval);
router.post('/platform/evaluations/pareto', c.pareto);
module.exports = router;
