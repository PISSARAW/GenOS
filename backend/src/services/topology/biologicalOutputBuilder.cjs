'use strict';

const { collectMechanisms, metapopulationComplete, isVerifiedResult, populationAnswer } = require('./biologicalHelpers.cjs');

function buildBiologicalOutput({ context, mode, mission, members, accepted, topology }) {
  return {
    orchestratorId: context.orchestratorId,
    biologicalMode: {
      status: 'accepted', mode, mission,
      capacity: workerGarage.getDynamicCapacity(context.orchestratorId),
      mechanisms: collectMechanisms(members),
      ...topology, members: accepted,
      ...(mode === 'metapopulation' ? {
        status: metapopulationComplete(accepted, members) ? 'completed' : 'partial',
        complete: metapopulationComplete(accepted, members),
        migrationReviewStatus: accepted.length === members.length && accepted.every((member) => isVerifiedResult(member.result)) ? 'completed' : 'partial',
        results: accepted.map((member) => member.result || null),
        answer: accepted.map((member) => `## ${member.role}\n${populationAnswer(member)}`).join('\n\n')
      } : {})
    }
  };
}

module.exports = { buildBiologicalOutput };