/**
 * GenOS Config Routes
 */

const express = require('express');
const router = express.Router();
const configController = require('../controllers/configController');
const { requirePermission } = require('../middleware/auth');

router.get('/config', configController.getConfig);
router.get('/model', configController.getModelStatus);
router.get('/model/local', configController.getLocalModels);
router.post('/model/test', requirePermission('experiment:run'), configController.testModel);
router.post('/profile', configController.updateProfile);
router.get('/budget', configController.getBudget);
router.post('/budget', configController.updateBudget);

module.exports = router;
