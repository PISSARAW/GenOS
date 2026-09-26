'use strict';

const POLICY_DEFINITIONS = Object.freeze({
  epistemic_jury: policy({ disclosure: 'sealed', review: 'specialized', aggregation: 'evidence_first', dissent: 'preserve_material' }),
  delphi_community: policy({ disclosure: 'anonymous_rounds', review: 'anonymous_feedback', aggregation: 'calibrated_distribution', dissent: 'preserve_minorities', minimumRounds: 2 }),
  adversarial_assembly: policy({ disclosure: 'sealed', review: 'adversarial_only', aggregation: 'verified_evidence_first', dissent: 'counterexample_veto', requireAdversarialReviewer: true }),
  forecasting_crowd: policy({ disclosure: 'sealed', review: 'forecast_review', aggregation: 'calibrated_distribution', dissent: 'preserve_minorities', probabilisticOnly: true, requireCalibrationWeights: true }),
  argumentation_community: policy({ disclosure: 'sealed', review: 'structured_arguments', aggregation: 'argument_graph', dissent: 'preserve_material', executionLevel: 'PARTIAL' }),
  polycentric_council: policy({ disclosure: 'sealed', review: 'local_specialized', aggregation: 'hierarchical', dissent: 'preserve_cluster_dissent', executionLevel: 'PARTIAL' }),
  byzantine_resilient_community: policy({ disclosure: 'sealed', review: 'provenance_first', aggregation: 'verified_evidence_first', dissent: 'counterexample_veto', quarantineAware: true, executionLevel: 'PARTIAL' }),
  minority_preserving_jury: policy({ disclosure: 'sealed', review: 'specialized', aggregation: 'evidence_first', dissent: 'preserve_all', preserveAllDissent: true }),
  representative_community: policy({ disclosure: 'sealed', review: 'representative_panel', aggregation: 'weighted_distribution', dissent: 'preserve_minorities', executionLevel: 'PARTIAL' }),
  persistent_community: policy({ disclosure: 'sealed', review: 'longitudinal', aggregation: 'calibrated_distribution', dissent: 'preserve_history', executionLevel: 'PARTIAL' }),
  human_ai_deliberation: policy({ disclosure: 'sealed', review: 'human_and_ai', aggregation: 'pluralism_with_human_judgment', dissent: 'preserve_all', requireHumanReview: true, preserveAllDissent: true }),
  hybrid_oracle_community: policy({ disclosure: 'sealed', review: 'specialized', aggregation: 'deterministic_oracle_first', dissent: 'counterexample_veto', requireDeterministicVerifier: true })
});

const ALIASES = Object.freeze({ delphi: 'delphi_community' });
const AUTO_RULES = Object.freeze([
  { variant: 'human_ai_deliberation', type: 'NORMATIVE', signal: /ethic|moral|should|ought|devrait|faut.il|valeur/i },
  { variant: 'forecasting_crowd', type: 'PROBABILISTIC', signal: /forecast|predict|probabil|prevision|predire|risque|likelihood/i },
  { variant: 'adversarial_assembly', signal: /security|securite|threat|menace|audit|attack|attaque|falsif/i },
  { variant: 'hybrid_oracle_community', type: 'FACTUAL', signal: /verify|verifi|prove|prouver|confirm|confirmer|true|vrai/i },
  { variant: 'minority_preserving_jury', signal: /dissent|dissensus|minority|minoritaire|disagreement|désaccord|plural/i },
  { variant: 'delphi_community', signal: /uncertain|incertain|expert|estimate|estimer|anonymous|anonyme/i }
]);

function policy(options) {
  return Object.freeze({
    disclosure: options.disclosure, review: options.review,
    aggregation: options.aggregation, dissent: options.dissent,
    minimumRounds: options.minimumRounds || 1,
    requireAdversarialReviewer: options.requireAdversarialReviewer || false,
    probabilisticOnly: options.probabilisticOnly || false,
    requireCalibrationWeights: options.requireCalibrationWeights || false,
    preserveAllDissent: options.preserveAllDissent || false,
    requireHumanReview: options.requireHumanReview || false,
    requireDeterministicVerifier: options.requireDeterministicVerifier || false,
    quarantineAware: options.quarantineAware || false,
    executionLevel: options.executionLevel || 'EXECUTABLE'
  });
}

const POLICIES = POLICY_DEFINITIONS;

function select(name) {
  const requested = String(name || 'epistemic_jury').trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
  const canonical = ALIASES[requested] || requested;
  const selected = POLICY_DEFINITIONS[canonical];
  if (!selected) throw Object.assign(new Error(`Unknown Biocenose variant '${requested}'.`), { code: 'BIOCENOSE_VARIANT_UNKNOWN' });
  return { name: canonical, ...selected };
}

function assertCompatible(selected, questionType) {
  if (selected.probabilisticOnly && questionType !== 'PROBABILISTIC') {
    throw Object.assign(new Error(`Biocenose variant '${selected.name}' requires a PROBABILISTIC question.`), {
      code: 'BIOCENOSE_VARIANT_QUESTION_TYPE_INVALID'
    });
  }
}

function recommend(question, questionType) {
  const text = String(question || '').normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const detectedType = questionType || require('../question/questionClassifier').classifyQuestion(question).questionType;
  const matches = AUTO_RULES.filter((rule) => (!rule.type || rule.type === detectedType) && rule.signal.test(text));
  const selected = matches.find((rule) => POLICIES[rule.variant].executionLevel === 'EXECUTABLE');
  return {
    ...select(selected?.variant || 'epistemic_jury'),
    selection: {
      variant: selected?.variant || 'epistemic_jury',
      method: selected ? 'mission_signals' : 'safe_baseline',
      confidence: selected ? 0.8 : 0.5,
      reasons: selected ? [`QUESTION_TYPE:${detectedType}`, `MISSION_SIGNAL:${selected.signal.source}`] : ['NO_DISCRIMINATING_MISSION_SIGNAL']
    }
  };
}

module.exports = { POLICIES, select, recommend, assertCompatible };
