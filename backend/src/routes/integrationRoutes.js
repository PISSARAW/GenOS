const express = require('express'); const router = express.Router(); const c = require('../controllers/integrationController'); const { requirePermission } = require('../middleware/auth'); const { requireTenantScope } = require('../middleware/tenant');
router.use(requireTenantScope());
router.get('/', c.list); router.post('/', requirePermission('workspace:write'), requireTenantScope({ write: true }), c.install); router.delete('/:id', requirePermission('workspace:write'), requireTenantScope({ write: true }), c.remove); router.post('/:id/test', c.test); module.exports = router;
