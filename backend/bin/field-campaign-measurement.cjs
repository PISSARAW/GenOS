'use strict';

const { fingerprint } = require('../src/services/stateFingerprint');
const MEASUREMENT_SCHEMA = 'genos.shev-field-window-measurement/v1';

function pressureValues(phase, intervention, metrics) {
  const training = phase === 'training';
  const fullArc = intervention === 'full_arc';
  if (!training || !fullArc || !metrics.pressureEvidenceHash) return { before: null, after: null };
  return { before: metrics.developmentalPressureBefore,
    after: metrics.developmentalPressureAfter, evidenceHash: metrics.pressureEvidenceHash };
}

function progressVerdict(input) {
  const { phase, intervention, metrics, pressure } = input;
  if (phase !== 'heldout') return 'not_tested';
  if (intervention !== 'full_arc') return 'not_tested';
  if (!metrics.success) return 'regressed';
  if (pressure.before == null || pressure.after == null) return 'inconclusive';
  if (pressure.after < pressure.before) return 'confirmed';
  return 'inconclusive';
}

function buildMeasurement(request, execution, metrics) {
  const intervention = request.arm === 'treatment' ? 'full_arc' : 'baseline';
  const pressure = pressureValues(request.phase, intervention, metrics);
  const progress = progressVerdict({ phase: request.phase, intervention, metrics, pressure });
  const clearance = progress === 'confirmed';
  const outcome = {
    success: metrics.success,
    projectId: request.project.projectId,
    actorId: execution.actorId,
    regressions: metrics.regressions,
    humanInterventions: metrics.humanInterventions,
    costUsd: metrics.costUsd,
    durationMs: metrics.durationMs,
    tokens: metrics.tokens,
    painObserved: request.phase === 'training' && metrics.painObserved,
    painObservationHash: request.phase === 'training' ? metrics.painObservationHash : null,
    developmentalPressureBefore: pressure.before,
    developmentalPressureAfter: pressure.after,
    progressResult: progress,
    clearanceApplied: clearance,
    clearanceEvidenceHash: clearance ? pressure.evidenceHash : null,
    artifactHash: execution.artifactHash
  };
  const body = {
    schema: MEASUREMENT_SCHEMA,
    executionId: execution.executionId,
    collectorId: `field-observer-${request.arm}`,
    measuredAt: new Date().toISOString(),
    outcome,
    evidenceRefs: [
      execution.artifactHash,
      outcome.painObservationHash,
      outcome.clearanceEvidenceHash
    ].filter(Boolean)
  };
  return { ...body, measurementHash: fingerprint(body) };
}

module.exports = { MEASUREMENT_SCHEMA, pressureValues, progressVerdict, buildMeasurement };
