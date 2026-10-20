'use strict';

const { collectMechanisms, metapopulationComplete, isVerifiedResult, populationAnswer } = require('./biologicalHelpers.cjs');
const workerGarage = require('../workerGarageService.js');

function buildBiologicalOutput({ context, mode, mission, members, accepted, topology }) {
  const dispatchFailures = context.dispatchFailures || [];
  const allWorkersCompleted = accepted.length === members.length
    && accepted.every((member) => member.status === 'completed')
    && dispatchFailures.length === 0;
  const modeStatus = mode === 'metapopulation'
    ? (metapopulationComplete(accepted, members) ? 'completed' : 'partial')
    : (allWorkersCompleted ? 'completed' : 'partial');
  return {
    orchestratorId: context.orchestratorId,
    biologicalMode: {
      status: modeStatus, mode, mission,
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