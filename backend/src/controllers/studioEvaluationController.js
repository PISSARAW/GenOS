'use strict';
const { getDatabase } = require('../db');
const service = require('../services/studioEvaluationService');

async function replay(req, res, next) {
  try { res.status(201).json(await service.replay(await getDatabase(), { ...req.tenant, id: req.params.id })); }
  catch (error) { next(error); }
}

async function compare(req, res, next) {
  try { res.json(await service.compare(await getDatabase(), { ...req.tenant, ids: String(req.query.ids || '').split(',') })); }
  catch (error) { next(error); }
}
module.exports = { replay, compare };
