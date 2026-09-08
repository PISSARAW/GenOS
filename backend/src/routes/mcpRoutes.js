/**
 * GenOS MCP Tool Arsenal & Circuit Breaker Routes
 */

const express = require('express');
const router = express.Router();
const mcpController = require('../controllers/mcpController');
const { requirePermission } = require('../middleware/auth');
const { requireTenantScope } = require('../middleware/tenant');
const { asyncHandler } = require('../middleware/asyncHandler');

router.use(requireTenantScope());

async function requireMcpTenant(req, res, next) {
	await requireTenantScope()(req, res, (error) => {
		if (error) return next(error);
		if (!req.tenant) return res.status(403).json({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'MCP execution requires an explicit organization and project scope.' } });
		next();
	});
}

router.get('/tools', requirePermission('read'), asyncHandler(mcpController.listTools));
router.post('/tools/dry-run', requirePermission('mcp:execute_safe'), asyncHandler(mcpController.dryRun));
router.get('/tools/metrics', requirePermission('read'), asyncHandler(mcpController.getMetrics));
router.get('/tools/:name/schema', requirePermission('read'), asyncHandler(mcpController.getSchema));
router.post('/tools/test', requirePermission('mcp:execute_safe'), requireMcpTenant, asyncHandler(mcpController.testTool));
router.post('/mcp/circuit-breaker', requirePermission('override_breaker'), asyncHandler(mcpController.toggleCircuitBreaker));
router.post('/mcp/equip', requirePermission('workspace:write'), asyncHandler(mcpController.equipTool));
router.post('/mcp/execute', requirePermission('mcp:execute_safe'), requireMcpTenant, asyncHandler(mcpController.executeTool));

module.exports = router;
