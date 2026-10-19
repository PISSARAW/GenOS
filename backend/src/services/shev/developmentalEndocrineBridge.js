'use strict';

const { recordAgentProgress } = require('./agentProgressService');

const HORMONE = 'somatotropin';
const MAX_PRESSURE = 1;

function bounded(value) {
  return Math.max(0, Math.min(MAX_PRESSURE, Number.isFinite(value) ? value : 0));
}

function observationWeight(kind) {
  if (kind === 'capability_gap') return 0.5;
  if (kind === 'degradation') return 0.35;
  return 0.2;
}

function addPressure(dimensions, dimension, increment) {
  const current = dimensions.get(dimension) || { dimension, pressure: 0, sources: 0 };
  current.pressure = 1 - (1 - current.pressure) * (1 - increment);
  current.sources += 1;
  dimensions.set(dimension, current);
}

function addObservations(dimensions, observations) {
  for (const row of observations || []) {
    if (!['degradation', 'capability_gap', 'blind_spot'].includes(row.kind)
        || row.epistemic_status !== 'observed') continue;
    addPressure(dimensions, row.dimension, observationWeight(row.kind));
  }
}

function addRecurrences(dimensions, episodes) {
  for (const episode of episodes || []) {
    const current = dimensions.get(episode.dimension);
    if (!current) continue;
    const recurrence = episode.current_phase === 'relapsed' ? 0.35 : 0.1;
    current.pressure = 1 - (1 - current.pressure) * (1 - recurrence);
  }
}

function calculatePressure(observations, episodes) {
  const dimensions = new Map();
  addObservations(dimensions, observations);
  addRecurrences(dimensions, episodes);
  const profile = [...dimensions.values()].map((item) => ({ ...item, pressure: bounded(item.pressure) }))
    .sort((left, right) => right.pressure - left.pressure);
  return { developmentalPressure: bounded(profile.reduce((sum, item) => sum + item.pressure, 0)
    / Math.max(1, profile.length)), profile };
}

async function loadProjectHistory(db, projectId) {
  const observations = await db.all(`SELECT dimension, kind, epistemic_status FROM shev_observations
    WHERE project_id = ? ORDER BY created_at`, [projectId]);
  const episodes = await db.all(`SELECT o.dimension, h.current_phase FROM shev_healing_episodes h
    JOIN shev_observations o ON o.project_id = h.project_id AND o.id = h.source_observation_id
    WHERE h.project_id = ? ORDER BY h.opened_at`, [projectId]);
  return { observations, episodes };
}

async function verifyHormoneAuthority(input, operation) {
  if (input.authorization?.requiresExplicitAuthorization !== true
      || typeof input.verifyAuthorization !== 'function') {
    throw new Error('developmental-endocrine-explicit-authorization-required');
  }
  const authority = await input.verifyAuthorization({ authorization: input.authorization,
    projectId: input.projectId, operation });
  if (authority?.authorized !== true || typeof authority.evidenceRef !== 'string') {
    throw new Error('developmental-endocrine-authorization-not-verified');
  }
  return authority.evidenceRef;
}

function prioritizeJobs(jobs, profile) {
  const pressures = new Map(profile.map((item) => [item.dimension, item.pressure]));
  return jobs.map((job) => ({ ...job,
    developmentalPriority: bounded((Number(job.developmentalPriority) || 0)
      + (pressures.get(job.dimension) || 0)),
    pressureDimension: pressures.has(job.dimension) })).sort((left, right) =>
    right.developmentalPriority - left.developmentalPriority);
}

async function secretePressure(input) {
  if (typeof input.modulateEndocrine !== 'function') throw new Error('developmental-endocrine-adapter-required');
  const authorizationEvidenceRef = await verifyHormoneAuthority(input, 'secrete_developmental_pressure');
  const history = await loadProjectHistory(input.db, input.projectId);
  const load = calculatePressure(history.observations, history.episodes);
  if (load.developmentalPressure > 0) await input.modulateEndocrine({ action: 'secrete',
    hormone: HORMONE, signal: 'developmental_pressure', amount: load.developmentalPressure,
    swarmId: input.projectId, authorizationEvidenceRef,
    requiresExplicitAuthorization: true, promotionEligible: false });
  const priorities = prioritizeJobs(input.jobs || [], load.profile);
  return { ...load, priorities, hormone: HORMONE, promotionEligible: false };
}

async function recordProgressAndClear(input) {
  const progress = await recordAgentProgress(input.db, input.progress);
  if (progress.result !== 'confirmed') return { progress, clearance: null, promotionEligible: false };
  if (typeof input.modulateEndocrine !== 'function') throw new Error('developmental-endocrine-adapter-required');
  const authorizationEvidenceRef = await verifyHormoneAuthority(input, 'decay_developmental_pressure');
  const clearance = await input.modulateEndocrine({ action: 'decay', hormone: HORMONE,
    signal: 'developmental_pressure', decay_factor: 0.25,
    evidenceRef: input.progress.gvxEventId, authorizationEvidenceRef,
    requiresIndependentHeldoutVerification: true,
    promotionEligible: false });
  return { progress, clearance, promotionEligible: false };
}

module.exports = { calculatePressure, loadProjectHistory, prioritizeJobs,
  secretePressure, recordProgressAndClear };
