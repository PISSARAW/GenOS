/**
 * GenOS AgentDNA genome routes
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/genomeController');
const { requirePermission } = require('../middleware/auth');
const { requireTenantScope } = require('../middleware/tenant');

router.use(requireTenantScope());

router.get('/genomes', controller.listGenomes);
router.get('/genomes/policy', controller.getGenomePolicy);
router.put('/genomes/policy', requirePermission('workspace:write'), controller.setGenomePolicy);
router.get('/genomes/innovations', controller.listInnovations);
router.get('/genomes/selections', controller.listGenomeSelections);
router.post('/genomes/innovations', requirePermission('workspace:write'), controller.createInnovation);
router.post('/genomes/innovations/:id/evaluate', requirePermission('workspace:write'), controller.evaluateInnovation);
router.post('/genomes/innovations/:id/promote', requirePermission('workspace:write'), controller.promoteInnovation);
router.post('/genomes/innovations/:id/reject', requirePermission('workspace:write'), controller.rejectInnovation);
router.get('/genomes/:id', controller.getGenome);
router.post('/genomes/import', requirePermission('workspace:write'), controller.importGenomes);
router.post('/genomes/:id/operations/:operation', requirePermission('workspace:write'), controller.operateGenome);

module.exports = router;
