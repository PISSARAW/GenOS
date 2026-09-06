/**
 * GenOS Command Routes
 */

const express = require('express');
const router = express.Router();
const commandController = require('../controllers/commandController');
const { requireRole } = require('../middleware/auth');
const { attachTenant } = require('../middleware/tenant');

router.use(attachTenant);

router.post('/command', requireRole(['admin', 'operator']), commandController.handleCommand);
router.post('/terminal', requireRole(['admin', 'operator']), commandController.handleTerminal);

module.exports = router;

