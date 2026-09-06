/**
 * GenOS Biology & Resilience Routes
 */

const express = require('express');
const router = express.Router();
const resilienceController = require('../controllers/resilienceController');
const { requirePermission } = require('../middleware/auth');
const { attachTenant, requireTenantScope } = require('../middleware/tenant');

router.use(attachTenant);

router.post('/apoptosis', requirePermission('emergency_kill'), requireTenantScope({ write: true }), resilienceController.triggerApoptosis);
router.get('/policy', resilienceController.getPolicy);
router.post('/policy', requirePermission('security:manage'), requireTenantScope({ write: true }), resilienceController.updatePolicy);
router.post('/cryptobiosis/freeze', requirePermission('emergency_kill'), requireTenantScope({ write: true }), resilienceController.freezeCryptobiosis);
router.post('/cryptobiosis/thaw', requirePermission('emergency_kill'), requireTenantScope({ write: true }), resilienceController.thawCryptobiosis);
router.get('/drift', resilienceController.getDrift);
router.post('/drift', requireTenantScope({ write: true }), resilienceController.getDrift);

module.exports = router;
