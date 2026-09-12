/**
 * @file quantumVfsRoutes.js
 * @description Routes de l'API REST pour le Quantum VFS de GenOS.
 */

const express = require('express');
const router = express.Router();
const quantumVfsController = require('../controllers/quantumVfsController');

router.post('/stage', quantumVfsController.stageFile);
router.post('/superpose', quantumVfsController.superposeHypothesis);
router.post('/entangle', quantumVfsController.entangleFiles);
router.post('/tunnel-write', quantumVfsController.tunnelWrite);
router.post('/decoherence', quantumVfsController.triggerDecoherence);
router.get('/metrics', quantumVfsController.getMetrics);
router.post('/reset', quantumVfsController.reset);

module.exports = router;
