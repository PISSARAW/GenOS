const { selected } = require('./modeFlags');

function buildCompetition(contract, competition) {
  return competition
    ? { enabled: true, mode: selected(contract, 'strategy_arena') ? 'strategy_arena' : 'pareto_selection' }
    : { enabled: false };
}

function buildEvolution(contract, evolution) {
  return evolution
    ? { enabled: true, mode: selected(contract, 'genetic_strategy_algorithm') ? 'genetic_strategy_algorithm' : 'bounded_hypermutation' }
    : { enabled: false };
}

function buildParasitism(flags) {
  return { enabled: flags.highRisk || flags.security, mode: 'adversarial_parasite_branch', action: 'isolate_and_score_parasitic_trajectories' };
}

module.exports = { buildCompetition, buildEvolution, buildParasitism };