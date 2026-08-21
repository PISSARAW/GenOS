/**
 * GenOS Memory & Experience Routes
 */

const express = require('express');
const router = express.Router();
const memoryController = require('../controllers/memoryController');

router.get('/search', memoryController.search);
router.post('/search', memoryController.search);
router.post('/cherry-pick', memoryController.cherryPick);
router.post('/counterfactual', memoryController.counterfactual);

module.exports = router;
