const express = require('express');
const controller = require('../controllers/daemonController');
const residentController = require('../controllers/residentDaemonController');
const { requirePermission } = require('../middleware/auth');

const router = express.Router();

// Legacy Sentinel daemon endpoints
router.get('/status', requirePermission('read'), controller.getStatus);
router.post('/configure', requirePermission('workspace:write'), controller.configure);
router.post('/autostart', requirePermission('workspace:write'), controller.setAutostart);
router.post('/audit', requirePermission('read'), controller.runAudit);

router.get('/types', requirePermission('read'), residentController.getTypes);
router.post('/repair/:id/verify', requirePermission('workspace:write'), residentController.requireDb, residentController.verifyRepairEpisode);

// Resident daemon endpoints (ADR 0034)
router.post('/territories', requirePermission('workspace:write'), residentController.requireDb, residentController.createTerritory);
router.get('/territories/:id', requirePermission('read'), residentController.requireDb, residentController.getTerritory);
router.post('/territories/:id/head', requirePermission('workspace:write'), residentController.requireDb, residentController.updateHead);
router.post('/territories/:id/sweep', requirePermission('workspace:write'), residentController.requireDb, residentController.sweep);
router.post('/territories/:id/phenotypes', requirePermission('workspace:write'), residentController.requireDb, residentController.assignPhenotypes);
router.get('/territories/:id/phenotypes', requirePermission('read'), residentController.requireDb, residentController.getPhenotypes);
router.post('/territories/:id/brief', requirePermission('read'), residentController.requireDb, residentController.compileBrief);
router.get('/territories/:id/brief/:briefId', requirePermission('read'), residentController.requireDb, residentController.getBrief);
router.post('/territories/:id/feedback', requirePermission('workspace:write'), residentController.requireDb, residentController.recordFeedback);
router.post('/territories/:id/repair', requirePermission('workspace:write'), residentController.requireDb, residentController.openRepairEpisode);
router.post('/repair/:id/claim', requirePermission('workspace:write'), residentController.requireDb, residentController.claimRepairEpisode);
router.post('/repair/:id/close', requirePermission('workspace:write'), residentController.requireDb, residentController.closeRepairEpisode);
router.get('/daemons', requirePermission('read'), residentController.requireDb, residentController.listDaemons);
router.get('/daemons/:id', requirePermission('read'), residentController.requireDb, residentController.getDaemonState);

module.exports = router;
