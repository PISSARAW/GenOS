'use strict';

const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/auth');
const { requireTenantScope } = require('../middleware/tenant');
const { routeRateLimit } = require('../middleware/routeRateLimit');
const { createCapabilityInheritanceController } = require('../controllers/capabilityInheritanceController');

const controller = createCapabilityInheritanceController();
router.use(routeRateLimit, requireTenantScope());
router.get('/capabilities', requirePermission('gci:read'), controller.discover);
router.get('/capabilities/:capabilityId/:version', requirePermission('gci:read'), controller.inspect);
router.post('/projects/:projectId/link', requirePermission('gci:link'), requireTenantScope({ write: true }), controller.link);
router.post('/resolve', requirePermission('gci:read'), controller.resolve);
router.post('/adoptions', requirePermission('gci:adopt'), requireTenantScope({ write: true }), controller.adopt);
router.post('/projects/:projectId/invocations', requirePermission('gci:invoke'), requireTenantScope({ write: true }), controller.invoke);
router.post('/projects/:projectId/approval-proofs', requirePermission('gci:human-approve'), requireTenantScope({ write: true }), controller.approvalProof);
router.get('/projects/:projectId', requirePermission('gci:read'), controller.status);
router.post('/projects/:projectId/revocations', requirePermission('gci:revoke'), requireTenantScope({ write: true }), controller.revoke);
router.post('/projects/:projectId/upgrades/plan', requirePermission('gci:upgrade'), requireTenantScope({ write: true }), controller.upgrade);

module.exports = router;
