const express = require('express');
const controller = require('../controllers/actionGenomeController');
const { requirePermission } = require('../middleware/auth');

const router = express.Router();

router.get('/action-genomes', requirePermission('read'), controller.list);
router.post('/action-genomes/validate', requirePermission('read'), controller.validate);
router.get('/action-genomes/:id/:version', requirePermission('read'), controller.describe);
router.post('/action-genomes/:id/:version/evaluate', requirePermission('mcp:execute_safe'), controller.evaluate);

module.exports = router;
