/**
 * GenOS Agent Fleet & Deployment Routes
 */

const express = require('express');
const router = express.Router();
const deployController = require('../controllers/deployController');
const { requirePermission } = require('../middleware/auth');

router.post('/deploy', requirePermission('workspace:write'), deployController.deployAgent);
router.post('/deploy/trinity', requirePermission('workspace:write'), deployController.deployTrinity);
router.get('/agents', deployController.listAgents);
router.get('/agents/history', deployController.getAgentHistory);
router.post('/agents/:id/ping', deployController.pingAgent);
router.post('/agents/spawn', requirePermission('workspace:write'), deployController.deployAgent);

module.exports = router;
