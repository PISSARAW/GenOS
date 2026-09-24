'use strict';

const SEMANTICS = Object.freeze({
  FACTUAL: { decisionGoal: 'establish_supported_facts', oraclePriority: true, preservePluralism: false, humanJudgmentRequired: false },
  PROBABILISTIC: { decisionGoal: 'estimate_probability', oraclePriority: false, preservePluralism: true, humanJudgmentRequired: false },
  DESIGN: { decisionGoal: 'assess_design_options', oraclePriority: false, preservePluralism: true, humanJudgmentRequired: false },
  MULTI_CRITERIA: { decisionGoal: 'compare_explicit_criteria', oraclePriority: false, preservePluralism: true, humanJudgmentRequired: false },
  NORMATIVE: { decisionGoal: 'surface_value_disagreement', oraclePriority: false, preservePluralism: true, humanJudgmentRequired: true },
  EXPLORATORY: { decisionGoal: 'map_claims_and_open_questions', oraclePriority: false, preservePluralism: true, humanJudgmentRequired: false },
  MIXED: { decisionGoal: 'apply_type_specific_semantics', oraclePriority: false, preservePluralism: true, humanJudgmentRequired: true }
});

function semanticsFor(questionType) {
  return SEMANTICS[String(questionType || '').toUpperCase()] || SEMANTICS.MIXED;
}

module.exports = { SEMANTICS, semanticsFor };
