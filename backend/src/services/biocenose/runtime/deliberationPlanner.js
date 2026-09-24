'use strict';

const ROUND_STEPS = Object.freeze([
  'collect_sealed_judgments', 'build_claim_graph', 'review_and_verify',
  'build_argument_graph', 'collect_belief_revisions', 'check_independence',
  'aggregate_by_question_type', 'check_dissent', 'record_community_judgment'
]);

function planRound(input) {
  if (input.round >= input.constitution.roundLimit) {
    return { status: 'ROUND_LIMIT_REACHED', round: input.round, steps: [] };
  }
  return {
    status: 'PLANNED', round: input.round, questionType: input.constitution.questionType,
    aggregationPolicy: input.constitution.aggregationPolicy, steps: [...ROUND_STEPS]
  };
}

module.exports = { ROUND_STEPS, planRound };
