/**
 * GenOS Incidents & Global Alerts Routes
 */

const express = require('express');
const router = express.Router();
const incidentController = require('../controllers/incidentController');
const { requirePermission } = require('../middleware/auth');
const { paginateList } = require('../controllers/listPagination');

router.get('/alerts', paginateList(incidentController.getAlerts));
router.get('/incidents', incidentController.getIncidents);
router.post('/incidents/replay', incidentController.replayIncident);
router.post('/tasks/:id/kill', requirePermission('emergency_kill'), incidentController.killTask);

module.exports = router;
