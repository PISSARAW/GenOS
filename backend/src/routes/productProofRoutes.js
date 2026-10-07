const express = require('express');
const controller = require('../controllers/productProofController');
const { requirePermission } = require('../middleware/auth');
const { requireTenantScope } = require('../middleware/tenant');

const router = express.Router();
router.post('/assemblies/:assemblyId/retract', requirePermission('security:manage'), requireTenantScope({ write: true }),
  require('../controllers/aeisRetractionController').retract);
router.get('/consumer-runs/:runId', requirePermission('read'), requireTenantScope(),
  require('../controllers/consumerInspectionController').inspect);
router.get('/consumer-agents/:agentId/runs', requirePermission('read'), requireTenantScope(),
  require('../controllers/consumerInspectionController').listRuns);
router.get('/consumer-agents/:agentId/latest', requirePermission('read'), requireTenantScope(),
  require('../controllers/consumerInspectionController').inspect);
router.get('/safe-debugging', controller.getSafeDebugging);
router.post('/safe-debugging/run', requirePermission('experiment:run'), requireTenantScope({ write: true }), controller.runSafeDebugging);
router.get('/safe-debugging/workspaces/:workspaceId', requireTenantScope(), controller.inspectWorkspace);
router.post('/safe-debugging/workspaces/:workspaceId/run', requirePermission('experiment:run'), requireTenantScope({ write: true }), controller.runWorkspaceTest);

module.exports = router;
