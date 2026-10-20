'use strict';

const { createHash } = require('node:crypto');
const { recordObservation } = require('./observationService');
const { compilePending } = require('./initiativeService');

function regressionId(input) {
  const seed = `${input.initiativeId}\0${input.monitoringId}`;
  return `shev_regression_${createHash('sha256').update(seed).digest('hex')}`;
}

function regressionObservation(input) {
  const after = input.after;
  return { id: regressionId(input), projectId: input.projectId,
    domain: after.domain, dimension: after.dimension, kind: 'risk',
    epistemicStatus: 'observed', source: `shev:monitoring:${input.monitoringId}`,
    observedAt: after.observed_at, validUntil: after.valid_until,
    summary: `Régression post-intégration vérifiée pour ${after.dimension}.`,
    evidenceRefs: input.assessment.evidenceRefs };
}

async function ensureRegressionMission(db, input) {
  if (input.assessment.result !== 'regressed') return null;
  const observation = await recordObservation(db, regressionObservation(input));
  await compilePending(db, { projectId: input.projectId, nowMs: Date.now() });
  const initiative = await db.get(`SELECT * FROM shev_initiatives
    WHERE project_id = ? AND observation_id = ?`, [input.projectId, observation.id]);
  if (!initiative) throw new Error('SHEV regression mission was not compiled.');
  return { observationId: observation.id, initiativeId: initiative.id,
    status: initiative.status, taskId: initiative.task_id };
}

module.exports = { ensureRegressionMission, regressionObservation };
