'use strict';

function evaluateQualification(options) {
  const { suite, performedRepetitions, sourceClean, verificationPassed } = options;
  const repetitionPolicy = suite.controls.repetitions;
  const pilotRequired = repetitionPolicy.pilot;
  const confirmatoryRequired = repetitionPolicy.confirmatory;
  const pilotPerformed = Math.min(performedRepetitions, pilotRequired);
  const confirmatoryComplete = suite.status === 'confirmatory'
    && performedRepetitions >= confirmatoryRequired;
  const confirmatoryEligible = sourceClean && verificationPassed && confirmatoryComplete;
  return {
    status: confirmatoryEligible ? 'confirmatory' : pilotPerformed > 0 ? 'pilot' : 'protocol',
    repetitions: {
      pilot: { required: pilotRequired, performed: pilotPerformed, complete: pilotPerformed >= pilotRequired },
      confirmatory: { required: confirmatoryRequired, performed: performedRepetitions,
        complete: confirmatoryComplete }
    },
    confirmatoryEligible,
    blockers: qualificationBlockers({ suite, sourceClean, verificationPassed, confirmatoryComplete })
  };
}

function qualificationBlockers(options) {
  const { suite, sourceClean, verificationPassed, confirmatoryComplete } = options;
  const blockers = [];
  if (!sourceClean) blockers.push('source_tree_dirty');
  if (!verificationPassed) blockers.push('campaign_verification_incomplete');
  if (suite.status !== 'confirmatory') blockers.push('suite_not_confirmatory');
  if (!confirmatoryComplete) blockers.push('confirmatory_repetitions_incomplete');
  return blockers;
}

module.exports = { evaluateQualification };
