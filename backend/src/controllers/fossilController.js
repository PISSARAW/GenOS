const { getDatabase } = require('../db');
const fossilization = require('../services/fossilizationService');

function scope(req) {
  return { organizationId: req.tenant.organizationId, projectId: req.tenant.projectId };
}

function errorStatus(error) {
  return error.code === 'SQLITE_CONSTRAINT' ? 409 : 400;
}

async function list(req, res) {
  const db = await getDatabase();
  const fossils = await fossilization.listFossils(db, { ...scope(req), limit: Number(req.query.limit) || 200 });
  res.json({ success: true, fossils, total: fossils.length });
}

async function record(req, res) {
  const db = await getDatabase();
  try {
    const result = await fossilization.recordFossil({ ...req.body, ...scope(req) }, db);
    res.status(201).json(result);
  } catch (error) {
    res.status(errorStatus(error)).json({ success: false, error: error.message });
  }
}

async function strata(req, res) {
  const db = await getDatabase();
  const result = await fossilization.listStrata(db, scope(req));
  res.json({ success: true, strata: result, total_strata: result.length });
}

async function getById(req, res) {
  const db = await getDatabase();
  const result = await fossilization.excavateFossil(db, req.params.id, scope(req));
  if (!result.success) return res.status(404).json(result);
  res.json({ success: true, fossil: result.specimen, integrity_verified: result.integrity_verified });
}

async function excavate(req, res) {
  const db = await getDatabase();
  const result = await fossilization.excavateFossil(db, req.params.id, scope(req));
  if (!result.success) return res.status(404).json(result);
  res.json(result);
}

async function decode(req, res) {
  const db = await getDatabase();
  const result = await fossilization.decodeFossil(db, req.params.id, scope(req));
  if (!result.success) return res.status(404).json(result);
  res.json(result);
}

module.exports = { list, record, strata, getById, excavate, decode };
