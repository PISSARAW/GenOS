'use strict';

function validWindow(window) {
  return window && typeof window.period === 'string' && window.period.trim()
    && Number.isFinite(window.exposure) && window.exposure > 0
    && validWindowCosts(window) && Array.isArray(window.evidenceRefs)
    && window.evidenceRefs.length > 0;
}

function validWindowCosts(window) {
  return Number.isFinite(window.recoveryMinutes) && window.recoveryMinutes >= 0
    && Number.isFinite(window.costUsd) && window.costUsd >= 0;
}

function summary(series) {
  const exposure = series.reduce((sum, item) => sum + item.exposure, 0);
  return { windows: series.length, exposure,
    regressionsPerExposure: series.reduce((sum, item) => sum + item.regressions, 0) / exposure,
    recoveryMinutesPerExposure: series.reduce((sum, item) => sum + item.recoveryMinutes, 0) / exposure,
    costUsdPerExposure: series.reduce((sum, item) => sum + item.costUsd, 0) / exposure };
}

function aligned(treated, references) {
  const periods = treated.map((item) => item.period);
  return new Set(periods).size === periods.length && references.every((reference) =>
    reference.series.every((item, index) => item.period === periods[index]
      && Math.abs(item.exposure - treated[index].exposure) <= treated[index].exposure * 0.1));
}

async function verifiedTreatment(db, input) {
  const ids = input.treated.map((item) => item.monitoringId);
  if (new Set(ids).size !== ids.length) throw new Error('SHEV comparison reuses a monitoring receipt.');
  for (const window of input.treated) {
    const row = await db.get(`SELECT m.result, m.assessed_at, o.dimension FROM shev_monitoring m
      JOIN shev_initiatives i ON i.id = m.initiative_id
      JOIN shev_observations o ON o.project_id = i.project_id AND o.id = i.observation_id
      WHERE m.id = ? AND i.project_id = ?`, [window.monitoringId, input.projectId]);
    if (!row || row.dimension !== input.dimension
      || Date.parse(row.assessed_at) <= Date.parse(input.preRegistrationAt)
      || window.regressions !== Number(row.result === 'regressed')) {
      throw new Error('SHEV treatment does not match monitored outcomes.');
    }
  }
}

function validReference(reference, count) {
  return reference.id && reference.protocolRef && Array.isArray(reference.series)
    && reference.series.length === count
    && reference.series.every((window) => validWindow(window)
      && Number.isSafeInteger(window.regressions) && window.regressions >= 0);
}

function validComparisonSeries(input) {
  return Array.isArray(input.treated) && input.treated.length >= 4
    && input.treated.every(validWindow)
    && Array.isArray(input.references) && input.references.length >= 2
    && new Set(input.references.map((item) => item.id)).size === input.references.length
    && input.references.every((item) => validReference(item, input.treated.length))
    && aligned(input.treated, input.references);
}

function validComparison(input) {
  return input?.id && input.projectId && input.dimension && input.preRegistrationRef
    && Number.isFinite(Date.parse(input.preRegistrationAt))
    && Array.isArray(input.confounders) && typeof input.verifyReferences === 'function'
    && validComparisonSeries(input);
}

async function recordLongitudinalComparison(db, input) {
  if (!validComparison(input)) throw new TypeError('SHEV comparison needs preregistered matched longitudinal references.');
  await verifiedTreatment(db, input);
  const verification = await input.verifyReferences(input.references);
  if (verification?.verified !== true || !verification.verifierRef
    || !Array.isArray(verification.evidenceRefs) || verification.evidenceRefs.length < 2) {
    throw new Error('SHEV longitudinal references lack independent verification.');
  }
  const treated = summary(input.treated);
  const references = input.references.map((item) => ({ id: item.id, ...summary(item.series) }));
  const result = { treated, references, contrasts: references.map((item) => ({ id: item.id,
    regressionRateDifference: treated.regressionsPerExposure - item.regressionsPerExposure,
    recoveryTimeDifference: treated.recoveryMinutesPerExposure - item.recoveryMinutesPerExposure,
    costDifference: treated.costUsdPerExposure - item.costUsdPerExposure })),
    causalClaim: false };
  const protocol = { preRegistrationRef: input.preRegistrationRef,
    preRegistrationAt: input.preRegistrationAt, confounders: input.confounders,
    referenceVerification: verification, treated: input.treated, references: input.references };
  await db.run(`INSERT OR IGNORE INTO shev_longitudinal_comparisons
    (id, project_id, dimension, protocol_json, result_json) VALUES (?, ?, ?, ?, ?)`,
  [input.id, input.projectId, input.dimension, JSON.stringify(protocol), JSON.stringify(result)]);
  const row = await db.get('SELECT * FROM shev_longitudinal_comparisons WHERE id = ?', [input.id]);
  if (row.protocol_json !== JSON.stringify(protocol)) throw new Error('SHEV comparison idempotency conflict.');
  return { ...row, result };
}

module.exports = { recordLongitudinalComparison };
