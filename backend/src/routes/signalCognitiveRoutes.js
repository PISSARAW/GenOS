const express = require('express');
const { requirePermission } = require('../middleware/auth');
const { requireTenantScope } = require('../middleware/tenant');
const { getDatabase } = require('../db');
const jobs = require('../services/signalCognitiveJobsService');
const router = express.Router();

function requireExplicitScope(req, res, next) {
  if (!req.tenant) {
    return res.status(400).json({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'Organization and project headers are required.' } });
  }
  next();
}

router.get('/cognitive-jobs',
  requirePermission('security:manage'), requireTenantScope(), requireExplicitScope,
  async (req, res, next) => {
    try {
      res.json({ jobs: await jobs.listScopedCognitiveJobs(await getDatabase(), req.tenant) });
    } catch (error) { next(error); }
  });

router.post('/cognitive-jobs/:signalId/retry',
  requirePermission('security:manage'), requireTenantScope({ write: true }), requireExplicitScope,
  async (req, res, next) => {
    try {
      const retried = await jobs.retryDeadCognitiveJob(await getDatabase(), req.tenant, req.params.signalId);
      res.status(retried ? 202 : 404).json({ retried });
    } catch (error) { next(error); }
  });

module.exports = router;
