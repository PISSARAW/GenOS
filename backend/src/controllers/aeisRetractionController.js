'use strict';

async function retract(req, res, next) {
  try {
    if (!req.tenant || !req.user?.isAuthenticated) return res.status(403).json({ error: { code: 'TENANT_SCOPE_REQUIRED' } });
    const db = await require('../db').getDatabase();
    const result = await require('../services/aeisAssemblyRetraction').retract(db, {
      assemblyId: req.params.assemblyId, scope: req.tenant, actorId: req.user.keyId,
      expectedAssemblyHash: req.body?.expectedAssemblyHash, rationale: req.body?.rationale
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json(result);
  } catch (error) { next(error); }
}

module.exports = { retract };
