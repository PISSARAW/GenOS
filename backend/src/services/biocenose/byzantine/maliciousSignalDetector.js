'use strict';

function inspect(signal) {
  const flags = [];
  if (signal.confidence >= 0.95 && !signal.evidenceRefs?.length) flags.push('HIGH_CONFIDENCE_WITHOUT_EVIDENCE');
  if (signal.evidenceRefs?.some((reference) => typeof reference !== 'string' || !reference.trim())) flags.push('INVALID_EVIDENCE_REFERENCE');
  if (signal.forecasts?.some((item) => !Number.isFinite(item.probability) || item.probability < 0 || item.probability > 1)) flags.push('INVALID_FORECAST_SIGNAL');
  return { status: flags.length ? 'REVIEW_REQUIRED' : 'NO_SIGNAL', flags };
}

module.exports = { inspect };
