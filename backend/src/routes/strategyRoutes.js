const express = require('express');
const controller = require('../controllers/strategyController');
const { requirePermission } = require('../middleware/auth');

const router = express.Router();
router.get('/', controller.list);
router.post('/select', requirePermission('workspace:write'), controller.preview);

module.exports = router;
