'use strict';

const express = require('express');
const { getDatabase } = require('../db');
const { requireRole } = require('../middleware/auth');
const registry = require('../services/missionResourceRegistryService');

const router = express.Router();
router.use(requireRole(['admin']));

router.post('/missions/:missionId/resources', async (req, res, next) => {
  try {
    const observation = await registry.record(await getDatabase(), {
      ...req.body, missionId: req.params.missionId,
      actor: req.user.keyId || req.user.username
    });
    res.status(201).json(observation);
  } catch (error) { next(error); }
});

router.get('/missions/:missionId/resources/:kind/:resourceKey', async (req, res, next) => {
  try {
    const observation = await registry.latest(await getDatabase(), {
      missionId: req.params.missionId, kind: req.params.kind, resourceKey: req.params.resourceKey
    });
    if (!observation) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No resource observation.' } });
    return res.json(observation);
  } catch (error) { return next(error); }
});

module.exports = router;
