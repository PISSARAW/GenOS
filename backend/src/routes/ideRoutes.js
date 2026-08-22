const express = require('express');
const router = express.Router();
const controller = require('../controllers/ideController');
router.get('/contract', controller.contract);
router.get('/integrations', controller.list);
router.post('/integrations', controller.connect);
router.post('/commands/:command', controller.execute);
module.exports = router;
