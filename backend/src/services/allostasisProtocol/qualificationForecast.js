'use strict';

const { validCandidate } = require('../agow/candidateValidationService');
const regret = require('../agow/allostaticRegretAdapter');
const { digest } = require('../evidenceProtocol/canonical');
const { validateForecast } = require('./contract');
const c = require('./qualificationConfig');
const { sampleReasons } = require('./qualificationMeasures');

function checkCandidate(candidate, qualifier, input) {
  const current = c.now(qualifier.clock);
  if (!validCandidate(candidate) || candidate.candidateId !== input.candidateId
    || candidate.agentId !== qualifier.config.sourceAgentId) c.fail('ALLOSTASIS native forecast candidate identity or contract invalid.');
  if (!Number.isSafeInteger(candidate.producedAt) || candidate.producedAt > current || candidate.expiresAt <= current) {
    c.fail('ALLOSTASIS native forecast candidate is stale, future or not timestamped exactly.');
  }
  return forecastScope(candidate, input.level);
}

function forecastScope(candidate, level) {
  const forecast = candidate.epistemicContext?.viabilityForecast;
  if (!forecast) c.fail('ALLOSTASIS actual native viability forecast required.');
  if (forecast.scopeForecasts && !forecast.scopeForecasts[level]) c.fail('ALLOSTASIS native forecast does not cover this level.');
  if (!forecast.scopeForecasts && level !== 'agent') c.fail('ALLOSTASIS legacy unscoped forecast is agent-only.');
  return forecast;
}

function scopeReasons(native, measured, qualifier) {
  const scopes = native.scopeForecasts ? Object.keys(native.scopeForecasts) : ['agent'];
  return scopes.filter(level => sampleReasons(measured.levels[level], qualifier.config, c.now(qualifier.clock)).length)
    .map(level => `forecast_scope_unavailable:${level}`);
}

async function capture(qualifier, input) {
  c.exact(input, ['forecastId', 'reportId', 'level', 'unit', 'amount', 'candidateId'], ['uncertainty']);
  c.text(input.forecastId); c.text(input.candidateId);
  if (typeof qualifier.loadCandidate !== 'function') c.fail('ALLOSTASIS trusted native candidate reader required.');
  const measured = await qualifier.captureSnapshot({ reportId: input.reportId, level: input.level });
  if (!measured.available) return { available: false, forecast: null, reasons: measured.reasons, allocationAuthorized: false };
  const query = { scope: qualifier.config.scope, missionId: qualifier.config.missionId,
    sourceAgentId: qualifier.config.sourceAgentId, subject: measured.report.subject, candidateId: input.candidateId };
  const candidate = c.copy(await qualifier.loadCandidate(c.frozen(query)));
  const native = checkCandidate(candidate, qualifier, input);
  const unavailable = scopeReasons(native, measured, qualifier);
  if (unavailable.length) return { available: false, forecast: null, reasons: unavailable, allocationAuthorized: false };
  const assessment = regret.evaluate(candidate, { allostaticLevels: measured.levels });
  if (assessment.available !== true) c.fail('ALLOSTASIS native forecast assessment unavailable.');
  const currentReport = await qualifier.captureSnapshot({ reportId: input.reportId, level: input.level });
  if (!c.same(measured.report, currentReport.report)) c.fail('ALLOSTASIS measurements changed during forecast source read.');
  const forecast = { forecastId: input.forecastId, reportId: input.reportId, reportDigest: measured.reportDigest,
    scope: qualifier.config.scope, missionId: qualifier.config.missionId, subject: measured.report.subject,
    unit: input.unit, amount: input.amount, horizon: { unit: 'cycles', amount: native.horizonCycles },
    producedAt: c.iso(candidate.producedAt), validUntil: c.iso(Math.min(candidate.expiresAt, Date.parse(measured.report.validUntil))),
    uncertainty: input.uncertainty || { kind: 'unknown' }, demandSource: 'declared',
    provenance: { sourceId: `agow:candidate:${candidate.candidateId}`, sourceDigest: digest(candidate), evidenceRefs: candidate.evidenceRefs,
      method: 'native_viability_assessment_with_declared_resource_need' }, nativeCandidate: candidate, nativeAssessment: assessment };
  validateForecast(forecast, { now: c.now(qualifier.clock) });
  return { available: true, forecast, forecastDigest: digest(forecast), report: measured.report,
    reasons: [], allocationAuthorized: false };
}

module.exports = { capture };
