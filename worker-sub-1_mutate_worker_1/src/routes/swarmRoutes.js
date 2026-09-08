/**
 * GenOS Swarm Consensus Routes
 */

const express = require('express');
const router = express.Router();
const swarmController = require('../controllers/swarmController');
const { requirePermission } = require('../middleware/auth');
const { requireTenantScope } = require('../middleware/tenant');

router.get('/consensus', requireTenantScope(), swarmController.getConsensus);
router.get('/metrics', requireTenantScope(), swarmController.getMetrics);
router.get('/topology', requireTenantScope(), swarmController.getTopology);
router.post('/proposals', requirePermission('swarm:propose'), requireTenantScope({ write: true }), swarmController.createProposal);
router.post('/vote', requirePermission('swarm:vote'), requireTenantScope({ write: true }), swarmController.castVote);

module.exports = router;
