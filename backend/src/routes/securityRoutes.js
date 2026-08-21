/**
 * GenOS Security & Emergency Kill Switch Routes
 */

const express = require('express');
const router = express.Router();
const securityController = require('../controllers/securityController');
const { requirePermission, requireRole } = require('../middleware/auth');

router.post('/security/kill-switch', requirePermission('emergency_kill'), securityController.triggerKillSwitch);
router.post('/security/kill-switch/reset', requireRole(['admin']), securityController.resetKillSwitch);
router.post('/halt', requirePermission('emergency_kill'), securityController.globalHalt);
router.get('/security/status', securityController.getSecurityStatus);

module.exports = router;
