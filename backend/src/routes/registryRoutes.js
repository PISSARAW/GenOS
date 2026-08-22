const express = require('express');
const router = express.Router();
const controller = require('../controllers/registryController');
const { requirePermission } = require('../middleware/auth');
const { requireTenantScope } = require('../middleware/tenant');

router.use(requireTenantScope());
router.get('/', controller.list);
router.get('/marketplace', controller.marketplace);
router.get('/:kind', controller.list);
router.post('/:kind', requirePermission('workspace:write'), controller.create);
router.post('/artifacts/:id/versions', requirePermission('workspace:write'), controller.addVersion);
router.post('/artifacts/:id/publish', requirePermission('workspace:write'), controller.publish);
router.post('/marketplace/:id/install', requirePermission('workspace:write'), controller.install);

module.exports = router;
