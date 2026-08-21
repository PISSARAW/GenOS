/**
 * GenOS Telemetry & Status Routes
 */

const express = require('express');
const router = express.Router();
const telemetryController = require('../controllers/telemetryController');

router.get('/telemetry', telemetryController.streamSSE);
router.get('/telemetry/stream', telemetryController.streamSSE);
router.get('/telemetry/events', telemetryController.getEvents);
router.post('/telemetry/events', telemetryController.ingestEvent);
router.get('/status', telemetryController.getStatus);
router.get('/health', telemetryController.getHealth);
router.get('/dashboard', telemetryController.getDashboard);
router.get('/achievements', telemetryController.getAchievements);

module.exports = router;
