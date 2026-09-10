/**
 * GenOS Security & Emergency Kill Switch Routes
 */

const express = require('express');
const router = express.Router();
const securityController = require('../controllers/securityController');
const { requireRole } = require('../middleware/auth');
const { issueCsrfToken } = require('../middleware/security');

router.get('/security/csrf', issueCsrfToken);
// The global kill switch halts every MCP tool and managed runtime: it is an
// admin action, NOT the same privilege as `emergency_kill` (chaos/incident).
router.post('/security/kill-switch', requireRole(['admin']), securityController.triggerKillSwitch);
router.post('/security/kill-switch/reset', requireRole(['admin']), securityController.resetKillSwitch);
router.post('/halt', requireRole(['admin']), securityController.globalHalt);
router.get('/security/status', requireRole(['admin']), securityController.getSecurityStatus);

module.exports = router;
