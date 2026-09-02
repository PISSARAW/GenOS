/**
 * GenOS Arena & Multi-Solver Tournament Routes
 */

const express = require('express');
const router = express.Router();
const arenaController = require('../controllers/arenaController');

router.get('/tournament', arenaController.getTournament);
router.post('/tournament', arenaController.runTournament);
router.post('/run', arenaController.runTournament);
router.get('/pareto', arenaController.getPareto);
router.post('/pareto', arenaController.getPareto);
router.get('/trace', arenaController.getTrace);

module.exports = router;
