/**
 * Chaos Engineering routes for resilience drills.
 */

const express = require('express');
const router = express.Router();
const chaosController = require('../controllers/chaosController');
const { requirePermission } = require('../middleware/auth');
const { requireTenantScope } = require('../middleware/tenant');

// Both routes now carry their own authorization and tenant scope. The previous
// global requireTenantScope() duplicated the POST scope and left GET /targets
// permission-free, letting any authenticated tenant enumerate kill targets.
router.post('/inject', requirePermission('emergency_kill'), requireTenantScope({ write: true }), chaosController.injectChaos);
router.get('/targets', requirePermission('emergency_kill'), requireTenantScope(), chaosController.listChaosTargets);

module.exports = router;
