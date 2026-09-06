const express = require('express');
const router = express.Router();
const controller = require('../controllers/ideController');
const { requireTenantScope } = require('../middleware/tenant');
router.get('/contract', controller.contract);
router.get('/integrations', requireTenantScope(), controller.list);
router.post('/integrations', requireTenantScope({ write: true }), controller.connect);
router.post('/commands/:command', controller.execute);
module.exports = router;
