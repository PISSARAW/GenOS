const express = require('express');
const router = express.Router();
const controller = require('../controllers/frameworkController');
const { requirePermission } = require('../middleware/auth');
const { requireTenantScope } = require('../middleware/tenant');

router.use(requireTenantScope());
router.get('/runs', controller.list);
router.post('/:framework/run', requirePermission('workspace:write'), controller.run);

module.exports = router;
