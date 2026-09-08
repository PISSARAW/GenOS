const express = require('express');
const controller = require('../controllers/productProofController');
const { requirePermission } = require('../middleware/auth');
const { requireTenantScope } = require('../middleware/tenant');

const router = express.Router();
router.get('/safe-debugging', controller.getSafeDebugging);
router.post('/safe-debugging/run', requirePermission('experiment:run'), requireTenantScope({ write: true }), controller.runSafeDebugging);
router.get('/safe-debugging/workspaces/:workspaceId', requireTenantScope(), controller.inspectWorkspace);
router.post('/safe-debugging/workspaces/:workspaceId/run', requirePermission('experiment:run'), requireTenantScope({ write: true }), controller.runWorkspaceTest);

module.exports = router;
