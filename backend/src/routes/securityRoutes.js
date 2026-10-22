/**
 * GenOS Security & Emergency Kill Switch Routes
 */

const express = require('express');
const router = express.Router();
const securityController = require('../controllers/securityController');
const securityPerceptionController = require('../controllers/securityPerceptionController');
const shreController = require('../controllers/shreController');
const { requireRole, requirePermission } = require('../middleware/auth');
const { requireTenantScope } = require('../middleware/tenant');
const { issueCsrfToken } = require('../middleware/security');

router.get('/security/csrf', issueCsrfToken);
// The global kill switch halts every MCP tool and managed runtime: it is an
// admin action, NOT the same privilege as `emergency_kill` (chaos/incident).
router.post('/security/kill-switch', requireRole(['admin']), securityController.triggerKillSwitch);
router.post('/security/kill-switch/reset', requireRole(['admin']), securityController.resetKillSwitch);
router.post('/halt', requireRole(['admin']), securityController.globalHalt);
router.get('/security/status', requireRole(['admin']), securityController.getSecurityStatus);
router.post('/security/evidence-reports/assemble', requireRole(['admin']), securityController.assembleEvidenceReport);
router.post('/security/evidence-reports/verify', requireRole(['admin']), securityController.verifyEvidenceReport);

router.post('/security/asp/sensors', requirePermission('security:manage'), requireTenantScope({ write: true }), securityPerceptionController.registerSensor);
router.post('/security/asp/observations', requirePermission('security:manage'), requireTenantScope({ write: true }), securityPerceptionController.observe);
router.get('/security/asp/state', requirePermission('read'), requireTenantScope(), securityPerceptionController.state);
router.post('/security/asp/incidents', requirePermission('security:manage'), requireTenantScope({ write: true }), securityPerceptionController.recordIncident);
router.post('/security/asp/calibration', requirePermission('security:manage'), requireTenantScope({ write: true }), securityPerceptionController.calibrate);
router.post('/security/asp/world', requirePermission('security:manage'), requireTenantScope({ write: true }), securityPerceptionController.updateWorld);
router.get('/security/asp/world', requirePermission('read'), requireTenantScope(), securityPerceptionController.getWorld);

router.post('/security/shre/cases', requirePermission('security:manage'), requireTenantScope({ write: true }), shreController.create);
router.get('/security/shre/cases/:caseId', requirePermission('read'), requireTenantScope(), shreController.getCase);
router.post('/security/shre/cases/:caseId/plan', requirePermission('security:manage'), requireTenantScope({ write: true }), shreController.plan);
router.post('/security/shre/cases/:caseId/simulate', requirePermission('security:manage'), requireTenantScope({ write: true }), shreController.simulate);
router.post('/security/shre/cases/:caseId/authorize', requirePermission('security:manage'), requireTenantScope({ write: true }), shreController.authorize);
router.post('/security/shre/cases/:caseId/apply', requirePermission('security:manage'), requireTenantScope({ write: true }), shreController.apply);
router.post('/security/shre/cases/:caseId/counter-test', requirePermission('security:manage'), requireTenantScope({ write: true }), shreController.counterTest);
router.post('/security/shre/cases/:caseId/causal-verify', requirePermission('security:manage'), requireTenantScope({ write: true }), shreController.causalVerify);
router.post('/security/shre/cases/:caseId/close', requirePermission('security:manage'), requireTenantScope({ write: true }), shreController.close);
router.post('/security/shre/cases/:caseId/rollback', requirePermission('security:manage'), requireTenantScope({ write: true }), shreController.rollback);

module.exports = router;
