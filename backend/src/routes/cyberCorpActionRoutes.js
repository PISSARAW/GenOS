'use strict';

const express = require('express');
const controller = require('../controllers/cyberCorpActionController');
const { requirePermission } = require('../middleware/auth');
const { requireTenantScope } = require('../middleware/tenant');

const router = express.Router();
router.get('/actions', requirePermission('read'), requireTenantScope(), controller.list);
router.post('/actions/execute', requirePermission('security:manage'), requireTenantScope({ write: true }), controller.execute);

module.exports = router;
