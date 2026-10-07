'use strict';
const { getDatabase } = require('../db');
const service = require('../services/studioProtocolService');

async function run(req, res, next) {
  try {
    const method = req.params.experimentId ? 'replay' : 'register';
    res.status(201).json(await service[method](await getDatabase(), { ...req.body, ...req.tenant,
      experimentId: req.params.experimentId, actor: req.user.keyId || req.user.username }));
  } catch (error) { next(error); }
}
module.exports = { run };
