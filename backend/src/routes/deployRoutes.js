/**
 * GenOS Agent Fleet & Deployment Routes
 */

const express = require('express');
const router = express.Router();
const deployController = require('../controllers/deployController');
const agentDossierController = require('../controllers/agentDossierController');
const strategyExecutionController = require('../controllers/strategyExecutionController');
const { requirePermission } = require('../middleware/auth');
const { attachTenant, requireTenantScope } = require('../middleware/tenant');
const { paginateList } = require('../controllers/listPagination');

router.use(attachTenant);

router.post('/deploy', requirePermission('workspace:write'), requireTenantScope({ write: true }), deployController.deployAgent);
router.post('/deploy/trinity', requirePermission('workspace:write'), requireTenantScope({ write: true }), deployController.deployTrinity);
router.get('/deploy/trinity', requireTenantScope(), deployController.listTrinityWorlds);
router.get('/agents', requireTenantScope(), paginateList(deployController.listAgents));
router.get('/agents/:id/dossier', requireTenantScope(), agentDossierController.getAgentDossier);
router.post('/agents/:id/stop', requirePermission('workspace:write'), requireTenantScope({ write: true }), deployController.stopAgent);
router.post('/agents/bulk-stop', requirePermission('workspace:write'), requireTenantScope({ write: true }), deployController.stopAgents);
router.post('/agents/bulk-delete', requirePermission('workspace:write'), requireTenantScope({ write: true }), deployController.deleteAgents);
router.delete('/agents/:id', requirePermission('workspace:write'), requireTenantScope({ write: true }), deployController.deleteAgent);
router.get('/agents/:id/strategy-contract', requireTenantScope(), deployController.getStrategyContract);
router.get('/agents/:id/strategy-contracts', requireTenantScope(), deployController.getStrategyContractHistory);
router.post('/agents/:id/strategy-contracts', requirePermission('workspace:write'), requireTenantScope({ write: true }), deployController.selectStrategyContract);
router.get('/agents/:id/execution-runs/latest', requireTenantScope(), strategyExecutionController.latest);
router.get('/agents/:id/execution-runs', requireTenantScope(), strategyExecutionController.list);
router.post('/execution-runs/:runId/approve', requirePermission('workspace:write'), requireTenantScope({ write: true }), strategyExecutionController.approve);
router.post('/agents/:id/subscribe', requireTenantScope({ write: true }), deployController.subscribeAgent);
router.get('/agents/history', requireTenantScope(), deployController.getAgentHistory);
router.post('/agents/:id/ping', requireTenantScope({ write: true }), deployController.pingAgent);
router.post('/agents/:id/events', requirePermission('workspace:write'), requireTenantScope({ write: true }), deployController.ingestAgentEvent);
router.post('/agents/:id/start', requirePermission('workspace:write'), requireTenantScope({ write: true }), deployController.startAgent);
router.get('/agents/:id/workers/garage', requireTenantScope(), deployController.getWorkerGarage);
router.post('/agents/:id/workers/:workerId/dispatch', requirePermission('workspace:write'), requireTenantScope({ write: true }), deployController.dispatchWorker);
router.post('/agents/spawn', requirePermission('workspace:write'), requireTenantScope({ write: true }), deployController.deployAgent);

module.exports = router;
