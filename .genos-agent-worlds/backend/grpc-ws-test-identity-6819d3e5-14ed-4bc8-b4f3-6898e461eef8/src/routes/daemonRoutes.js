const express = require('express');
const controller = require('../controllers/daemonController');
const { requirePermission } = require('../middleware/auth');

const router = express.Router();

router.get('/status', controller.getStatus);
router.post('/configure', requirePermission('workspace:write'), controller.configure);
router.post('/autostart', requirePermission('workspace:write'), controller.setAutostart);
router.post('/audit', requirePermission('workspace:read'), controller.runAudit);

module.exports = router;
