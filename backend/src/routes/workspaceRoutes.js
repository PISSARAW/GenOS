/**
 * GenOS Workspace & Time Machine Routes
 */

const express = require('express');
const router = express.Router();
const workspaceController = require('../controllers/workspaceController');
const { requirePermission } = require('../middleware/auth');
const { attachTenant, requireTenantScope } = require('../middleware/tenant');
const { paginateList } = require('../controllers/listPagination');

router.use(requireTenantScope());

router.get('/', paginateList(workspaceController.listWorkspaces));
router.post('/', requirePermission('workspace:write'), requireTenantScope({ write: true }), workspaceController.createWorkspace);
router.get('/diff', workspaceController.getDiff);
router.post('/bisect', requirePermission('workspace:write'), requireTenantScope({ write: true }), workspaceController.bisect);
router.post('/rollback', requirePermission('workspace:write'), requireTenantScope({ write: true }), workspaceController.rollback);
router.get('/:id/files', workspaceController.getWorkspaceFiles);
router.get('/:id/rollback-preview', workspaceController.previewRollback);
router.get('/:id', workspaceController.getWorkspaceById);
router.get('/:id/snapshots', workspaceController.getSnapshots);
router.post('/:id/snapshots', requirePermission('workspace:write'), requireTenantScope({ write: true }), workspaceController.createSnapshot);
router.post('/:id/restore', requirePermission('workspace:write'), requireTenantScope({ write: true }), workspaceController.restoreSnapshot);

module.exports = router;
