'use strict';

function qualifiesForOpening(niche, options = {}) {
  const threshold = Number.isFinite(options.minimumOpportunityScore) ? options.minimumOpportunityScore : 0.2;
  const minimumScore = Math.max(0, Math.min(1, threshold));
  const hasEvidence = Array.isArray(niche.evidenceRefs) && niche.evidenceRefs.length > 0;
  const uncertainty = Number(niche.justifiedUncertainty) || 0;
  return niche.opportunityScore >= minimumScore && (hasEvidence || uncertainty >= 0.75);
}

module.exports = { qualifiesForOpening };
