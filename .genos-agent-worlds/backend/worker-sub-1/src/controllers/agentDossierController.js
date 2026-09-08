const { getDatabase } = require('../db');
const { loadAgentDossier } = require('../services/agentDossierService');

async function getAgentDossier(req, res, next) {
  try {
    const dossier = await loadAgentDossier(await getDatabase(), req.params.id, req.tenant);
    if (!dossier) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Agent ${req.params.id} not found` } });
    }
    res.json(dossier);
  } catch (error) {
    next(error);
  }
}

module.exports = { getAgentDossier };
