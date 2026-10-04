const express = require('express');
const { requirePermission } = require('../middleware/auth');
const { requireTenantScope } = require('../middleware/tenant');
const { getDatabase } = require('../db');
const receptorStore = require('../services/signalReceptorPersistenceService');
const router = express.Router();

function requireExplicitScope(req, res, next) {
  if (!req.tenant) {
    return res.status(400).json({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'Organization and project headers are required.' } });
  }
  next();
}

router.use(requirePermission('security:manage'), requireTenantScope({ write: true }), requireExplicitScope);

router.get('/receptors', async (req, res, next) => {
  try {
    res.json({ receptors: await receptorStore.listScopedReceptors(await getDatabase(), req.tenant) });
  } catch (error) { next(error); }
});

router.put('/receptors/:id', async (req, res, next) => {
  try {
    const receptor = { ...(req.body || {}), id: req.params.id };
    const result = await receptorStore.saveScopedReceptor(await getDatabase(), req.tenant, receptor);
    res.status(200).json(result);
  } catch (error) { next(error); }
});

router.delete('/receptors/:id', async (req, res, next) => {
  try {
    const removed = await receptorStore.deleteScopedReceptor(await getDatabase(), req.tenant, req.params.id);
    res.status(removed ? 200 : 404).json({ removed });
  } catch (error) { next(error); }
});

module.exports = router;
