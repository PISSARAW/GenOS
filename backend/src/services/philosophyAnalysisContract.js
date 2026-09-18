'use strict';

function boundedAnalysis(result, args = {}) {
  const source = result?.provenance || {};
  return {
    ...(result || {}),
    contractVersion: 'genos.philosophy-analysis/v1',
    evidence: Array.isArray(result?.evidence) ? result.evidence : (Array.isArray(args.evidence) ? args.evidence : []),
    uncertainty: result?.uncertainty || { status: result?.status || 'undetermined' },
    provenance: { source: source.source || 'declared-inputs', verified: false, ...source },
    promotionEligible: false,
  };
}

module.exports = { boundedAnalysis };
