'use strict';

function buildPhasesStage1(__genosStageScope1) {
if (__genosStageScope1.modes.competition && !__genosStageScope1.flags.security) __genosStageScope1.phases.push((0, __genosStageScope1.phase)('competition_and_selection', ['genos_adversarial_review'], 'Run adversarial comparison and select a Pareto-safe winner.'));
}

module.exports = { buildPhasesStage1 };
