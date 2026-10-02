'use strict';

const crypto = require('node:crypto');
const persistence = require('../agowStatePersistenceService');

const SCOPE = 'agow_cognitive_trajectories';

function validTrajectory(input) {
  return Boolean(input?.agentId && input.frame?.frameId && input.frame.realityMode !== 'counterfactual'
    && Array.isArray(input.steps) && input.steps.length >= 2 && input.steps.every((step) => typeof step === 'string')
    && typeof input.success === 'boolean');
}

function trajectoryRecord(input) {
  return { trajectoryId: input.trajectoryId || crypto.randomUUID(), frameId: input.frame.frameId,
    candidateRefs: [...new Set(input.candidateRefs || [])], stepRefs: input.steps.slice(0, 64),
    queryRefs: [...new Set(input.queryRefs || [])], actionRef: input.actionRef || null,
    outcomeRefs: [...new Set(input.outcomeRefs || [])], context: input.context || {},
    success: input.success, evidenceRefs: [...new Set(input.evidenceRefs || [])],
    observedAt: Number(input.now) || Date.now() };
}

async function record(input) {
  if (!validTrajectory(input)) throw new TypeError('A real, evidence-linked cognitive trajectory is required.');
  const scope = await resolveDevelopmentalScope(input);
  const loaded = await persistence.load({ scope: SCOPE, agentId: input.agentId, db: input.db });
  const trajectories = Array.isArray(loaded.state.trajectories) ? loaded.state.trajectories : [];
  const record = trajectoryRecord(input);
  trajectories.push(record);
  await persistence.save({ scope: SCOPE, agentId: input.agentId, db: loaded.db,
    state: { trajectories: trajectories.slice(-2000) }, version: trajectories.length });
  const episode = await require('./autobiographicalEpisodeAdapter').capture({ ...input, trajectory: record });
  const developmentalSignals = scope ? await recordDevelopmentalSignals(input, record, scope) : [];
  return { ...record, autobiographicalEpisodeId: episode.id, developmentalSignals };
}

async function resolveDevelopmentalScope(input) {
  const requested = input.developmentalScope;
  if (!requested?.organizationId || !requested?.projectId) return null;
  const { resolveDevelopmentalScope: resolve } = require('../../developmentalBridge/developmentalScopeResolver');
  return resolve(input.db, input.agentId, requested);
}

async function recordDevelopmentalSignals(input, record, scope) {
  const { recordOutcomeSignals } = require('../../developmentalBridge/agowToGvxSignalAdapter');
  return recordOutcomeSignals(input.db, {
    scope, entityId: input.agentId, agentId: input.agentId,
    sourceEventId: record.trajectoryId, evidenceRefs: record.evidenceRefs,
    success: record.success, predictionError: input.predictionError, regret: input.regret,
    decompiled: input.decompiled, pathwayId: input.pathwayId,
    context: { frameId: record.frameId, pathwayId: input.pathwayId }
  });
}

async function list(options) {
  const loaded = await persistence.load({ scope: SCOPE, agentId: options.agentId, db: options.db });
  return Array.isArray(loaded.state.trajectories) ? loaded.state.trajectories : [];
}

module.exports = { record, list, validTrajectory, trajectoryRecord, SCOPE };
