'use strict';

function buildOpportunityMap(environment) {
  const opportunities = Array.isArray(environment?.opportunities) ? environment.opportunities : [];
  return opportunities.map((opportunity, index) => scoreOpportunity(opportunity, index));
}

function scoreOpportunity(opportunity, index) {
  const evidenceRefs = Array.isArray(opportunity?.evidenceRefs) ? opportunity.evidenceRefs.filter(Boolean) : [];
  const uncertainty = bounded(opportunity?.justifiedUncertainty);
  const evidenceSupported = evidenceRefs.length > 0 || uncertainty >= 0.75;
  const score = bounded(opportunity?.opportunityScore);
  return {
    opportunityId: opportunity?.id || `opportunity-${index + 1}`,
    descriptor: String(opportunity?.descriptor || '').trim(),
    opportunityScore: score,
    evidenceRefs,
    justifiedUncertainty: uncertainty,
    status: evidenceSupported ? 'candidate' : 'insufficient_evidence'
  };
}

function bounded(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

module.exports = { buildOpportunityMap };
