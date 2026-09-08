const router = require('express').Router();
const controller = require('../controllers/evaluationController');
const { requirePermission } = require('../middleware/auth');
const { requireTenantScope } = require('../middleware/tenant');
router.get('/overview', requireTenantScope(), controller.getOverview);
router.post('/impossible-bench', requirePermission('workspace:write'), requireTenantScope({ write: true }), controller.runImpossibleBench);
router.post('/mcts/:id/prune', requirePermission('workspace:write'), requireTenantScope({ write: true }), controller.pruneNode);
router.post('/notifications', requirePermission('workspace:write'), requireTenantScope({ write: true }), controller.updateNotifications);
module.exports = router;
