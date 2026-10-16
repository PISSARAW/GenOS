'use strict';

function isMissionOutcomeQualified(mission) {
  return mission?.oracleVerification?.status === 'independent'
    && mission?.oracleVerification?.passed === true
    && mission?.verification?.passed === true
    && mission?.lifecycle === 'verified';
}

function unqualifiedMissionOutcomes(missions = []) {
  return missions.filter((mission) => mission?.lifecycle === 'verified' && !isMissionOutcomeQualified(mission))
    .map((mission) => mission.name);
}

function qualifyHistoricalEnd(mission) {
  if (isMissionOutcomeQualified(mission)) return 'verified';
  if (!mission?.receiptObjectSha256 && !mission?.orchestratorId) return 'inconclusive';
  return 'unverified';
}

function qualifyHistoricalCampaign(missions = []) {
  return missions.map((mission) => ({ name: mission.name, historicalVerdict: qualifyHistoricalEnd(mission) }));
}

function missionList(options) {
  return Array.isArray(options.missions) ? options.missions : null;
}

function evaluateQualification(options) {
  const { suite, performedRepetitions, sourceClean, verificationPassed } = options;
  const missions = missionList(options);
  const repetitionPolicy = suite.controls.repetitions;
  const pilotRequired = repetitionPolicy.pilot;
  const confirmatoryRequired = repetitionPolicy.confirmatory;
  const pilotPerformed = Math.min(performedRepetitions, pilotRequired);
  const confirmatoryComplete = suite.status === 'confirmatory'
    && performedRepetitions >= confirmatoryRequired;
  const oracleCovered = missions ? unqualifiedMissionOutcomes(missions).length === 0 : true;
  const confirmatoryEligible = sourceClean && verificationPassed && confirmatoryComplete && oracleCovered;
  return {
    status: confirmatoryEligible ? 'confirmatory' : pilotPerformed > 0 ? 'pilot' : 'protocol',
    repetitions: {
      pilot: { required: pilotRequired, performed: pilotPerformed, complete: pilotPerformed >= pilotRequired },
      confirmatory: { required: confirmatoryRequired, performed: performedRepetitions,
        complete: confirmatoryComplete }
    },
    confirmatoryEligible,
    oracleCovered,
    blockers: qualificationBlockers({ suite, sourceClean, verificationPassed, confirmatoryComplete, missions })
  };
}

function qualificationBlockers(options) {
  const { suite, sourceClean, verificationPassed, confirmatoryComplete } = options;
  const missions = missionList(options);
  const blockers = [];
  if (!sourceClean) blockers.push('source_tree_dirty');
  if (!verificationPassed) blockers.push('campaign_verification_incomplete');
  if (suite.status !== 'confirmatory') blockers.push('suite_not_confirmatory');
  if (!confirmatoryComplete) blockers.push('confirmatory_repetitions_incomplete');
  if (missions && unqualifiedMissionOutcomes(missions).length > 0) {
    blockers.push('unverified-mission-marked-verified');
  }
  return blockers;
}

module.exports = { evaluateQualification, isMissionOutcomeQualified, unqualifiedMissionOutcomes,
  qualifyHistoricalEnd, qualifyHistoricalCampaign };
