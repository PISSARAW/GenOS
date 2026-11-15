'use strict';

function buildPhases(context) {
if (context.modes.competition && !context.flags.security) context.phases.push(context.phase('competition_and_selection', ['genos_adversarial_review'], 'Run adversarial comparison and select a Pareto-safe winner.'));
}

module.exports = { buildPhases };
