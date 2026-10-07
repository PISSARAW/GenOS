/**
 * GenOS Experiments Lab Routes
 */

const express = require('express');
const router = express.Router();
const experimentController = require('../controllers/experimentController');
const scientificEvidenceController = require('../controllers/scientificEvidenceController');
const { requirePermission } = require('../middleware/auth');
const { attachTenant, requireTenantScope } = require('../middleware/tenant');

router.use(requireTenantScope());

router.use('/:experimentId/evidence-ledger', scientificEvidenceController.attachExperimentScope);
router.post('/:experimentId/evidence-ledger', requirePermission('experiment:write'), requireTenantScope({ write: true }), scientificEvidenceController.createLedger);
router.get('/:experimentId/evidence-ledger', scientificEvidenceController.inspectLedger);
router.post('/:experimentId/evidence-ledger/claims', requirePermission('experiment:write'), requireTenantScope({ write: true }), scientificEvidenceController.recordClaim);
router.post('/:experimentId/evidence-ledger/claims/:claimId/evidence', requirePermission('experiment:write'), requireTenantScope({ write: true }), scientificEvidenceController.recordEvidence);
router.post('/:experimentId/evidence-ledger/claims/:claimId/assessments', requirePermission('experiment:write'), requireTenantScope({ write: true }), scientificEvidenceController.recordAssessment);
router.post('/:experimentId/evidence-ledger/claims/:claimId/transitions', requirePermission('experiment:write'), requireTenantScope({ write: true }), scientificEvidenceController.recordClaimTransition);

router.get('/', experimentController.listExperiments);
router.get('/recent', experimentController.getRecentExperiments);
router.post('/', requirePermission('experiment:write'), requireTenantScope({ write: true }), experimentController.launchExperiment);
router.post('/launch', requirePermission('experiment:write'), requireTenantScope({ write: true }), experimentController.launchExperiment);
router.post('/:experimentId/status', requirePermission('experiment:write'), requireTenantScope({ write: true }), experimentController.updateStatus);
router.post('/:experimentId/waves', requirePermission('experiment:write'), requireTenantScope({ write: true }), experimentController.recordWave);
router.post('/:experimentId/thoughts', requirePermission('experiment:write'), requireTenantScope({ write: true }), experimentController.recordThought);
router.get('/:experimentId/waves', experimentController.getWaves);
router.get('/analysis', experimentController.getAnalysis);
router.get('/thoughts', experimentController.getThoughts);
router.get('/coevolution', experimentController.getCoevolution);

module.exports = router;
