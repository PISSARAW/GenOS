'use strict';

const express = require('express');
const { getDatabase } = require('../db');
const { requireRole } = require('../middleware/auth');
const registry = require('../services/missionResourceRegistryService');
const missions = require('../services/missionIdentityService');
const survival = require('../services/survivalStateService');
const wakes = require('../services/survivalWakeService');
const missionChecks = require('../services/missionRegenerationChecksService');
const wakeRecovery = require('../services/survivalWakeRecoveryService');

const router = express.Router();
const adminOnly = requireRole(['admin']);

router.post('/missions/:missionId/resources', adminOnly, async (req, res, next) => {
  try {
    const observation = await registry.record(await getDatabase(), {
      ...req.body, missionId: req.params.missionId,
      actor: req.user.keyId || req.user.username
    });
    res.status(201).json(observation);
  } catch (error) { next(error); }
});

router.get('/missions/:missionId/resources/:kind/:resourceKey', adminOnly, async (req, res, next) => {
  try {
    const observation = await registry.latest(await getDatabase(), {
      missionId: req.params.missionId, kind: req.params.kind, resourceKey: req.params.resourceKey
    });
    if (!observation) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No resource observation.' } });
    return res.json(observation);
  } catch (error) { return next(error); }
});

router.post('/missions/:missionId/wake', adminOnly, async (req, res, next) => {
  try {
    const db = await getDatabase();
    const mission = await missions.get(db, req.params.missionId);
    if (!mission) return res.status(404).json({ error: { code: 'MISSION_NOT_FOUND', message: 'Mission not found.' } });
    if (mission.status !== 'dormant') return res.status(409).json({ error: { code: 'MISSION_NOT_DORMANT', message: 'Mission is not dormant.' } });
    const state = await survival.get(db, mission.orchestratorAgentId);
    const condition = state?.wakeConditionId ? await wakes.get({ db, id: state.wakeConditionId }) : null;
    if (condition?.missionId !== mission.missionId || condition.condition.type !== 'operator_or_signal') {
      return res.status(409).json({ error: { code: 'WAKE_CONDITION_MISMATCH', message: 'Mission has no armed operator wake.' } });
    }
    const result = await survival.wake(db, {
      agentId: mission.orchestratorAgentId, wakeConditionId: condition.id,
      event: { type: 'operator_signal', authorized: true }
    });
    return res.status(result.success ? 200 : 409).json(result);
  } catch (error) { return next(error); }
});

router.post('/missions/:missionId/wake/retry', adminOnly, async (req, res, next) => {
  try {
    const result = await wakeRecovery.retryAmbiguous(await getDatabase(), {
      missionId: req.params.missionId, evidenceRef: req.body?.evidenceRef,
      actor: req.user.keyId || req.user.username
    });
    return res.json(result);
  } catch (error) { return next(error); }
});

router.post('/missions/:missionId/regeneration-checks/:role', adminOnly, async (req, res, next) => {
  try {
    const policy = await missionChecks.configure(await getDatabase(), {
      missionId: req.params.missionId, role: req.params.role,
      commands: req.body?.commands, actor: req.user.keyId || req.user.username
    });
    return res.status(201).json(policy);
  } catch (error) { return next(error); }
});

router.get('/missions/:missionId/regeneration-checks/:role', adminOnly, async (req, res, next) => {
  try {
    const policy = await missionChecks.get(await getDatabase(), req.params.missionId, req.params.role);
    if (!policy) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No regeneration checks configured.' } });
    return res.json(policy);
  } catch (error) { return next(error); }
});

module.exports = router;
