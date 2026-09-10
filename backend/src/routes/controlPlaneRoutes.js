const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/auth');
const { requireTenantScope } = require('../middleware/tenant');
const controller = require('../controllers/controlPlaneController');

router.get('/organizations', controller.listOrganizations);
router.post('/organizations', requirePermission('workspace:write'), controller.createOrganization);
router.get('/projects', controller.listProjects);
router.get('/organizations/:id/members', requirePermission('read'), controller.listOrganizationMembers);
router.post('/organizations/:id/members', requirePermission('workspace:write'), controller.upsertOrganizationMember);
router.delete('/organizations/:id/members/:principalId', requirePermission('workspace:write'), controller.deleteOrganizationMember);
router.post('/projects', requirePermission('workspace:write'), controller.createProject);
router.post('/projects/:id/members', requirePermission('workspace:write'), controller.upsertProjectMember);
router.patch('/projects/:id', requirePermission('workspace:write'), controller.updateProject);
router.delete('/projects/:id/members/:principalId', requirePermission('workspace:write'), controller.deleteProjectMember);
router.delete('/projects/:id', requirePermission('workspace:delete'), controller.deleteProject);
router.post('/projects/:id/restore', requirePermission('workspace:write'), controller.restoreProject);
router.get('/environments', requireTenantScope(), controller.listEnvironments);
router.get('/workers', requireTenantScope(), controller.getWorkerMetrics);

module.exports = router;
