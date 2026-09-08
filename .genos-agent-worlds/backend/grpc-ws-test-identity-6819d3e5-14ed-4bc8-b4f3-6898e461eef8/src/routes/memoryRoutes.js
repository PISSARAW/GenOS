/**
 * GenOS Memory & Experience Routes
 */

const express = require('express');
const router = express.Router();
const memoryController = require('../controllers/memoryController');
const { attachTenant } = require('../middleware/tenant');

router.use(attachTenant);

router.get('/search', memoryController.search);
router.post('/search', memoryController.search);
router.post('/cherry-pick', memoryController.cherryPick);
router.post('/counterfactual', memoryController.counterfactual);
router.post('/vesicle', memoryController.generateVesicle);
router.post('/ingest', memoryController.ingestMemory);
router.post('/sleep', memoryController.sleepCycle);
router.post('/prune', memoryController.pruneSynapses);

module.exports = router;
