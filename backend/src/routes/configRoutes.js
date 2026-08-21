/**
 * GenOS Config Routes
 */

const express = require('express');
const router = express.Router();
const configController = require('../controllers/configController');

router.get('/config', configController.getConfig);
router.post('/profile', configController.updateProfile);
router.get('/budget', configController.getBudget);
router.post('/budget', configController.updateBudget);

module.exports = router;
