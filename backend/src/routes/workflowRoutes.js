const express = require('express');
const router = express.Router();
const controller = require('../controllers/workflowController');
const { requirePermission } = require('../middleware/auth');
const { requireTenantScope } = require('../middleware/tenant');
router.use(requireTenantScope());

router.get('/', controller.listWorkflows);
router.post('/', requirePermission('workspace:write'), controller.createWorkflow);
router.get('/:id', controller.getWorkflow);
router.put('/:id', requirePermission('workspace:write'), controller.updateWorkflow);
router.post('/:id/validate', controller.validateWorkflow);
router.post('/:id/runs', requirePermission('experiment:run'), controller.createRun);
router.get('/:id/runs', controller.listRuns);

module.exports = router;
