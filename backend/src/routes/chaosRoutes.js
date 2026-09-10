/**
 * Chaos Engineering routes for resilience drills.
 */

const express = require('express');
const router = express.Router();
const chaosController = require('../controllers/chaosController');
const { requirePermission } = require('../middleware/auth');
const { requireTenantScope } = require('../middleware/tenant');

router.use(requireTenantScope());

router.post('/inject', requirePermission('emergency_kill'), requireTenantScope({ write: true }), chaosController.injectChaos);
router.get('/targets', chaosController.listChaosTargets);

module.exports = router;
