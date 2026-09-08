const express = require('express');
const router = express.Router();
const controller = require('../controllers/schemaController');
const { requirePermission } = require('../middleware/auth');
router.get('/schema/status', controller.status);
router.post('/schema/migrate', requirePermission('workspace:write'), controller.migrate);
module.exports = router;
