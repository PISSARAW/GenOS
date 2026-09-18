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

function ontologyEvidence(result, args) {
  if (Array.isArray(result?.evidence)) return result.evidence;
  if (result?.evidence && typeof result.evidence === 'object') return [result.evidence];
  if (result?.evidenceStatus) return [{ status: result.evidenceStatus }];
  return Array.isArray(args?.evidence) ? args.evidence : [];
}

function boundedOntologyAnalysis(result, args = {}) {
  const normalized = boundedAnalysis({ ...result, evidence: ontologyEvidence(result, args) }, args);
  return {
    ...normalized,
    provenance: { source: 'ontology-service', scope: { organizationId: args.organizationId || null, projectId: args.projectId || null }, ...normalized.provenance },
  };
}

function withEpistemicContext(result, context = {}) {
  return {
    ...result,
    epistemic_context: {
      interpretive: true,
      provenanceComplete: false,
      promotionEligible: false,
      ...context,
    },
  };
}

module.exports = { boundedAnalysis, boundedOntologyAnalysis, withEpistemicContext };
