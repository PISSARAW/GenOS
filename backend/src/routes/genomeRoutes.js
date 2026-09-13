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
router.get('/genomes/:id', controller.getGenome);
router.post('/genomes/import', requirePermission('workspace:write'), controller.importGenomes);
router.post('/genomes/:id/operations/:operation', requirePermission('workspace:write'), controller.operateGenome);

module.exports = router;
