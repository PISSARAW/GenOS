'use strict';

function candidateIrreversibility(candidates) {
  return candidates.some((candidate) => Number(candidate.epistemicContext?.irreversibility) >= 0.8);
}

function highRegret(estimates, threshold) {
  return (Array.isArray(estimates) ? estimates : []).some((estimate) => Number(estimate.regret?.aggregate) >= threshold);
}

function closeCompetition(activations, margin) {
  const ranked = Object.values(activations || {}).sort((left, right) => right - left);
  return ranked.length > 1 && ranked[0] - ranked[1] <= margin;
}

function uncertaintyWithStakes(frame, candidates) {
  return frame.epistemicState.uncertainty >= 0.7
    && candidates.some((candidate) => candidate.measures.goalRelevance >= 0.8
      || Number(candidate.epistemicContext?.irreversibility) >= 0.5);
}

function normalized(options) {
  return { candidates: Array.isArray(options.candidates) ? options.candidates : [],
    frame: options.frame || { epistemicState: { uncertainty: 0 }, causalContext: { predictionError: 0 } } };
}

function decisionReasons(options, state) {
  const causes = [];
  if (candidateIrreversibility(state.candidates)) causes.push('irreversible_decision');
  if (highRegret(options.regretEstimates, options.regretThreshold ?? 0.65)) causes.push('high_predictive_regret');
  if (closeCompetition(options.arbitration?.competition?.activations, options.closeMargin ?? 0.15)) causes.push('close_competition');
  return causes;
}

function contextReasons(options, state) {
  const causes = [];
  if (uncertaintyWithStakes(state.frame, state.candidates)) causes.push('high_uncertainty_high_stakes');
  if (options.explicitCausalDiscrimination || state.frame.causalContext.predictionError >= 0.5) causes.push('causal_discrimination');
  return causes;
}

function reasons(options) {
  const state = normalized(options);
  return [...decisionReasons(options, state), ...contextReasons(options, state)];
}

function shouldSimulate(options) {
  const triggeredBy = reasons(options);
  return { triggered: triggeredBy.length > 0, triggeredBy };
}

module.exports = { shouldSimulate, reasons, closeCompetition };
