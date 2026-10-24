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
router.get('/projects/:projectId', requirePermission('gci:read'), controller.status);
router.post('/projects/:projectId/revocations', requirePermission('gci:revoke'), requireTenantScope({ write: true }), controller.revoke);

module.exports = router;
