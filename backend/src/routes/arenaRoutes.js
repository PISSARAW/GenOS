/**
 * GenOS Arena & Multi-Solver Tournament Routes
 */

const express = require('express');
const router = express.Router();
const arenaController = require('../controllers/arenaController');
const { requirePermission } = require('../middleware/auth');
const { requireTenantScope } = require('../middleware/tenant');

router.use(requireTenantScope());

router.get('/tournament', requirePermission('read'), arenaController.getTournament);
router.post('/tournament', requirePermission('experiment:run'), arenaController.runTournament);
router.post('/run', requirePermission('experiment:run'), arenaController.runTournament);
router.get('/pareto', requirePermission('read'), arenaController.getPareto);
router.post('/pareto', requirePermission('read'), arenaController.getPareto);
router.get('/trace', requirePermission('read'), arenaController.getTrace);

module.exports = router;
