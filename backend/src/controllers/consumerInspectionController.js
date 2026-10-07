'use strict';

async function inspect(req, res, next) {
  try {
    if (!req.tenant) return res.status(403).json({ error: { code: 'TENANT_SCOPE_REQUIRED' } });
    const db = await require('../db').getDatabase();
    const result = await require('../services/consumerInspectionService').inspect(db, {
      runId: req.params.runId, agentId: req.params.agentId, scope: req.tenant
    });
    if (!result) return res.status(404).json({ error: { code: 'RUN_NOT_FOUND' } });
    res.setHeader('Cache-Control', 'no-store');
    res.json(result);
  } catch (error) { next(error); }
}

async function listRuns(req, res, next) {
  try {
    if (!req.tenant) return res.status(403).json({ error: { code: 'TENANT_SCOPE_REQUIRED' } });
    const db = await require('../db').getDatabase();
    const result = await require('../services/consumerInspectionService').listRuns(db, {
      agentId: req.params.agentId, scope: req.tenant, query: req.query.q,
      status: req.query.status, limit: req.query.limit
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json(result);
  } catch (error) { next(error); }
}

module.exports = { inspect, listRuns };
