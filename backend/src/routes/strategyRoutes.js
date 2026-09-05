const express = require('express');
const controller = require('../controllers/strategyController');
const { requirePermission } = require('../middleware/auth');

const router = express.Router();
router.get('/', controller.list);
router.post('/select', requirePermission('workspace:write'), controller.preview);
router.get('/coverage/:orchestratorId', requirePermission('workspace:read'), controller.auditCoverage);
router.post('/coverage/:orchestratorId', requirePermission('workspace:write'), controller.auditCoverage);

module.exports = router;
