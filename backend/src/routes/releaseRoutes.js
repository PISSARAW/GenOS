const express = require('express');
const router = express.Router();
const controller = require('../controllers/releaseController');
const { requirePermission } = require('../middleware/auth');
const { requireTenantScope } = require('../middleware/tenant');

router.use(requireTenantScope());
router.get('/', controller.list);
router.post('/', requirePermission('workspace:write'), controller.create);
router.post('/:id/promote', requirePermission('workspace:write'), controller.promote);
router.post('/:id/rollback', requirePermission('workspace:write'), controller.rollback);
router.get('/rollouts', controller.listRollouts);
router.get('/chargeback', controller.chargeback);
router.post('/:id/rollouts', requirePermission('workspace:write'), controller.createRollout);
router.post('/rollouts/:rolloutId/metrics', requirePermission('workspace:write'), controller.recordRolloutMetric);
router.post('/rollouts/:rolloutId/decide', requirePermission('workspace:write'), controller.decideRollout);

module.exports = router;
