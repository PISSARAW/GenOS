/**
 * GenOS Biology & Resilience Routes
 */

const express = require('express');
const router = express.Router();
const resilienceController = require('../controllers/resilienceController');
const { requirePermission } = require('../middleware/auth');
const { attachTenant } = require('../middleware/tenant');

router.use(attachTenant);

router.post('/apoptosis', requirePermission('emergency_kill'), resilienceController.triggerApoptosis);
router.get('/policy', resilienceController.getPolicy);
router.post('/policy', requirePermission('security:manage'), resilienceController.updatePolicy);
router.post('/cryptobiosis/freeze', requirePermission('emergency_kill'), resilienceController.freezeCryptobiosis);
router.post('/cryptobiosis/thaw', requirePermission('emergency_kill'), resilienceController.thawCryptobiosis);
router.get('/drift', resilienceController.getDrift);
router.post('/drift', resilienceController.getDrift);

module.exports = router;
