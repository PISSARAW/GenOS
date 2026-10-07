'use strict';
const { getDatabase } = require('../db');
const lifecycle = require('../services/studioLifecycleService');

async function status(req, res, next) {
  try { res.json(await lifecycle.status(await getDatabase(), { ...req.tenant, operationId: req.query.operationId })); }
  catch (error) { next(error); }
}

async function restart(req, res, next) {
  try {
    const operation = await lifecycle.restart(await getDatabase(), req);
    res.once('finish', () => process.send({ type: 'studio:restart', operationId: operation.operationId }));
    res.status(202).json(operation);
  } catch (error) {
    if (next) return next(error);
    throw error;
  }
}

module.exports = { status, restart };
