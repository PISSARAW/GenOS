/**
 * GenOS Incidents & Global Alerts Routes
 */

const express = require('express');
const router = express.Router();
const incidentController = require('../controllers/incidentController');
const { requirePermission } = require('../middleware/auth');

router.get('/alerts', incidentController.getAlerts);
router.get('/incidents', incidentController.getIncidents);
router.post('/incidents/replay', incidentController.replayIncident);
router.post('/tasks/:id/kill', requirePermission('emergency_kill'), incidentController.killTask);

module.exports = router;
