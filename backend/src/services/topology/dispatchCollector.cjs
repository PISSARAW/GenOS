'use strict';

const { dispatchBiologicalMembers, dispatchMetapopulationReview } = require('./biologicalMemberDispatcher.cjs');

async function dispatchAndCollectResults({ db, context, mode, parent, members }) {
  const accepted = await dispatchBiologicalMembers({ db, context, mode, parent, members });
  if (mode !== 'metapopulation') return accepted;
  return dispatchMetapopulationReview({ db, context, parent, members, initialWorkers: accepted });
}

module.exports = { dispatchAndCollectResults };