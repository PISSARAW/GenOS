/**
 * GenOS Lineage DAG & Genome Routes
 */

const express = require('express');
const router = express.Router();
const lineageController = require('../controllers/lineageController');
const { requirePermission } = require('../middleware/auth');
const { requireTenantScope } = require('../middleware/tenant');

router.use(requireTenantScope());

router.get('/lineage', lineageController.getLineage);
router.post('/nodes/inspect', lineageController.inspectNode);
router.post('/nodes/clone', requirePermission('workspace:write'), lineageController.cloneNode);
router.post('/nodes/kill', requirePermission('workspace:write'), lineageController.killNode);

router.get('/genome/graph', lineageController.getGenomeGraph);
router.get('/genome/phylogeny', lineageController.getPhylogeny);
router.get('/genome/alleles', lineageController.getAlleles);
router.post('/genome/crossover', requirePermission('workspace:write'), lineageController.performCrossover);
router.post('/genome/synthesize', requirePermission('workspace:write'), lineageController.synthesizeGenome);
router.post('/genome/decision', requirePermission('workspace:write'), lineageController.recordDecision);

module.exports = router;
