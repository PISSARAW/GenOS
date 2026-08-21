/**
 * GenOS Experiments Lab Routes
 */

const express = require('express');
const router = express.Router();
const experimentController = require('../controllers/experimentController');
const { requirePermission } = require('../middleware/auth');

router.get('/', experimentController.listExperiments);
router.get('/recent', experimentController.getRecentExperiments);
router.post('/', requirePermission('experiment:write'), experimentController.launchExperiment);
router.post('/launch', requirePermission('experiment:write'), experimentController.launchExperiment);
router.get('/:experimentId/waves', experimentController.getWaves);
router.get('/analysis', experimentController.getAnalysis);
router.get('/thoughts', experimentController.getThoughts);
router.get('/coevolution', experimentController.getCoevolution);

module.exports = router;
