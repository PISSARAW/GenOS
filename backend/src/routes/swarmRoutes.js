/**
 * GenOS Swarm Consensus Routes
 */

const express = require('express');
const router = express.Router();
const swarmController = require('../controllers/swarmController');
const { requirePermission } = require('../middleware/auth');

router.get('/consensus', swarmController.getConsensus);
router.get('/metrics', swarmController.getMetrics);
router.get('/topology', swarmController.getTopology);
router.post('/proposals', requirePermission('swarm:propose'), swarmController.createProposal);
router.post('/vote', requirePermission('swarm:vote'), swarmController.castVote);

module.exports = router;
