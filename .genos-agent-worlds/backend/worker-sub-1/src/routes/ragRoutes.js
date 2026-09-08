const express = require('express'); const router = express.Router(); const c = require('../controllers/ragController'); const { requirePermission } = require('../middleware/auth'); const { requireTenantScope } = require('../middleware/tenant');
router.use(requireTenantScope());
router.get('/documents', c.listDocuments); router.post('/documents', requirePermission('workspace:write'), requireTenantScope({ write: true }), c.ingestDocument); router.get('/documents/:id/chunks', c.listChunks); router.post('/search', c.search); router.post('/ner/extract', c.extractEntities); module.exports = router;
