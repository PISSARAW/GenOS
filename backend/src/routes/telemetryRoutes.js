/**
 * GenOS Telemetry & Status Routes
 */

const express = require('express');
const router = express.Router();
const telemetryController = require('../controllers/telemetryController');
const { requirePermission } = require('../middleware/auth');

router.get('/telemetry', requirePermission('telemetry:read'), telemetryController.streamSSE);
router.get('/telemetry/stream', requirePermission('telemetry:read'), telemetryController.streamSSE);
router.get('/telemetry/events', requirePermission('telemetry:read'), telemetryController.getEvents);
router.post('/telemetry/events', requirePermission('workspace:write'), telemetryController.ingestEvent);
router.get('/status', telemetryController.getStatus);
router.get('/health', telemetryController.getHealth);
router.get('/dashboard', telemetryController.getDashboard);
router.get('/achievements', telemetryController.getAchievements);

module.exports = router;
