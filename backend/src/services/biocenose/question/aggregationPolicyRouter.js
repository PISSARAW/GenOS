'use strict';

const ROUTES = Object.freeze({
  FACTUAL: { policy: 'verified_evidence', evidenceFirst: true, humanReview: false },
  PROBABILISTIC: { policy: 'calibrated_probability_pooling', evidenceFirst: true, humanReview: false },
  DESIGN: { policy: 'evidence_informed_design_review', evidenceFirst: true, humanReview: false },
  MULTI_CRITERIA: { policy: 'pareto_options', evidenceFirst: true, humanReview: false },
  NORMATIVE: { policy: 'pluralism_with_human_judgment', evidenceFirst: false, humanReview: true },
  EXPLORATORY: { policy: 'claim_map', evidenceFirst: false, humanReview: false },
  MIXED: { policy: 'type_specific_plural_judgment', evidenceFirst: true, humanReview: true }
});

function routeAggregationPolicy(questionType) {
  const type = String(questionType || '').toUpperCase();
  const route = ROUTES[type] || ROUTES.MIXED;
  return { questionType: ROUTES[type] ? type : 'MIXED', ...route };
}

module.exports = { ROUTES, routeAggregationPolicy };
