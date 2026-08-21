/**
 * GenOS Workspace & Time Machine Routes
 */

const express = require('express');
const router = express.Router();
const workspaceController = require('../controllers/workspaceController');
const { requirePermission } = require('../middleware/auth');

router.get('/', workspaceController.listWorkspaces);
router.post('/', requirePermission('workspace:write'), workspaceController.createWorkspace);
router.get('/diff', workspaceController.getDiff);
router.post('/bisect', workspaceController.bisect);
router.post('/rollback', requirePermission('workspace:write'), workspaceController.rollback);
router.get('/:id/rollback-preview', workspaceController.previewRollback);
router.get('/:id', workspaceController.getWorkspaceById);
router.get('/:id/snapshots', workspaceController.getSnapshots);
router.post('/:id/snapshots', requirePermission('workspace:write'), workspaceController.createSnapshot);
router.post('/:id/restore', requirePermission('workspace:write'), workspaceController.restoreSnapshot);

module.exports = router;
