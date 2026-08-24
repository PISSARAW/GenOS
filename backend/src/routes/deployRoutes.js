/**
 * GenOS Agent Fleet & Deployment Routes
 */

const express = require('express');
const router = express.Router();
const deployController = require('../controllers/deployController');
const agentDossierController = require('../controllers/agentDossierController');
const strategyExecutionController = require('../controllers/strategyExecutionController');
const { requirePermission } = require('../middleware/auth');
const { attachTenant } = require('../middleware/tenant');
const { paginateList } = require('../controllers/listPagination');

router.use(attachTenant);

router.post('/deploy', requirePermission('workspace:write'), deployController.deployAgent);
router.post('/deploy/trinity', requirePermission('workspace:write'), deployController.deployTrinity);
router.get('/deploy/trinity', deployController.listTrinityWorlds);
router.get('/agents', paginateList(deployController.listAgents));
router.get('/agents/:id/dossier', agentDossierController.getAgentDossier);
router.post('/agents/:id/stop', requirePermission('workspace:write'), deployController.stopAgent);
router.post('/agents/bulk-stop', requirePermission('workspace:write'), deployController.stopAgents);
router.post('/agents/bulk-delete', requirePermission('workspace:write'), deployController.deleteAgents);
router.delete('/agents/:id', requirePermission('workspace:write'), deployController.deleteAgent);
router.get('/agents/:id/strategy-contract', deployController.getStrategyContract);
router.get('/agents/:id/strategy-contracts', deployController.getStrategyContractHistory);
router.post('/agents/:id/strategy-contracts', requirePermission('workspace:write'), deployController.selectStrategyContract);
router.get('/agents/:id/execution-runs/latest', strategyExecutionController.latest);
router.get('/agents/:id/execution-runs', strategyExecutionController.list);
router.post('/execution-runs/:runId/approve', requirePermission('workspace:write'), strategyExecutionController.approve);
router.post('/agents/:id/subscribe', deployController.subscribeAgent);
router.get('/agents/history', deployController.getAgentHistory);
router.post('/agents/:id/ping', deployController.pingAgent);
router.post('/agents/:id/events', requirePermission('workspace:write'), deployController.ingestAgentEvent);
router.post('/agents/:id/start', requirePermission('workspace:write'), deployController.startAgent);
router.get('/agents/:id/workers/garage', deployController.getWorkerGarage);
router.post('/agents/:id/workers/:workerId/dispatch', requirePermission('workspace:write'), deployController.dispatchWorker);
router.post('/agents/spawn', requirePermission('workspace:write'), deployController.deployAgent);

module.exports = router;
