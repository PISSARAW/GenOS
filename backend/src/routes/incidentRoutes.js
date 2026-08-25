/**
 * GenOS Incidents & Global Alerts Routes
 */

const express = require('express');
const router = express.Router();
const incidentController = require('../controllers/incidentController');
const { requirePermission } = require('../middleware/auth');
const { requireTenantScope } = require('../middleware/tenant');
const { paginateList } = require('../controllers/listPagination');

router.get('/alerts', paginateList(incidentController.getAlerts));
router.get('/incidents', incidentController.getIncidents);
router.post('/incidents/replay', requireTenantScope(), incidentController.replayIncident);
router.post('/tasks/:id/kill', requirePermission('emergency_kill'), requireTenantScope({ write: true }), incidentController.killTask);

module.exports = router;
