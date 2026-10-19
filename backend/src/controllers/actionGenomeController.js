const { validationResult } = require('../services/actionGenome/actionGenomeValidator');
const { getActionGenome, listActionGenomes } = require('../services/actionGenome/actionGenomeCatalog');
const { projectActionGenome } = require('../services/actionGenome/surfaceProjection');
const { admitCatalogAction } = require('../services/actionGenome/catalogActionAdmission');

function list(req, res) {
  res.json({ success: true, actions: listActionGenomes() });
}

function describe(req, res, next) {
  try {
    const genome = getActionGenome(req.params.id, req.params.version);
    res.json({ success: true, genome, projection: projectActionGenome(genome) });
  } catch (error) { next(error); }
}

function validate(req, res) {
  const validation = validationResult(req.body);
  res.status(validation.valid ? 200 : 400).json({ success: validation.valid, validation });
}

async function evaluate(req, res, next) {
  try {
    const body = req.body || {};
    const receipt = await admitCatalogAction({
      id: req.params.id,
      version: req.params.version,
      actorId: req.user.id,
      permissions: req.user.permissions || [],
      leases: body.leases || [],
      budget: body.budget,
      observedStateVersion: body.observedStateVersion,
      input: body.input
    });
    res.status(receipt.statement.admitted ? 200 : 409).json({ success: receipt.statement.admitted, receipt });
  } catch (error) { next(error); }
}

module.exports = { describe, evaluate, list, validate };
