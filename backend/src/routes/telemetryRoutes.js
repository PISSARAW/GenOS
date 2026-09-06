/**
 * GenOS Telemetry & Status Routes
 */

const express = require('express');
const router = express.Router();
const telemetryController = require('../controllers/telemetryController');
const { requirePermission } = require('../middleware/auth');
const { attachTenant, requireTenantScope } = require('../middleware/tenant');

router.use(requireTenantScope());

router.get('/telemetry', requirePermission('telemetry:read'), telemetryController.streamSSE);
router.get('/telemetry/stream', requirePermission('telemetry:read'), telemetryController.streamSSE);
router.get('/telemetry/events', requirePermission('telemetry:read'), telemetryController.getEvents);
router.post('/telemetry/events', requirePermission('workspace:write'), requireTenantScope({ write: true }), telemetryController.ingestEvent);
router.get('/status', telemetryController.getStatus);
router.get('/health', telemetryController.getHealth);
router.get('/dashboard', requirePermission('telemetry:read'), telemetryController.getDashboard);
router.get('/achievements', requirePermission('telemetry:read'), telemetryController.getAchievements);

module.exports = router;
