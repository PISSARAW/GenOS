'use strict';

const { dispatchBiologicalMembersCore } = require('./biologicalMemberDispatcherCore.cjs');
const metapopulationMissionResults = require('../metapopulation/metapopulationMissionResultService.js');

async function reviewMetapopulationCandidates({ db, context, parent, members, candidates }) {
  const reviewMembers = members.map((member) => ({
    ...member, mission: metapopulationMissionResults.reviewPrompt(member, candidates)
  }));
  return dispatchBiologicalMembersCore({ db, context, mode: 'metapopulation', parent, selected: reviewMembers, waves: false });
}

module.exports = { reviewMetapopulationCandidates };
