const router = require('express').Router();
const controller = require('../controllers/evaluationController');
const { requirePermission } = require('../middleware/auth');
router.get('/overview', controller.getOverview);
router.post('/impossible-bench', requirePermission('workspace:write'), controller.runImpossibleBench);
router.post('/mcts/:id/prune', requirePermission('workspace:write'), controller.pruneNode);
router.post('/notifications', requirePermission('workspace:write'), controller.updateNotifications);
module.exports = router;
