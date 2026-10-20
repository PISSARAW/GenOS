'use strict';

const { collectMechanisms, metapopulationComplete, isVerifiedResult, populationAnswer } = require('./biologicalHelpers.cjs');
const workerGarage = require('../workerGarageService.js');

function workerCompleted(member) {
  return member.status === 'completed';
}

function allWorkersCompleted(accepted, members, dispatchFailures) {
  return accepted.length === members.length
    && accepted.every(workerCompleted)
    && dispatchFailures.length === 0;
}

function buildMetapopulation(accepted, members) {
  const complete = metapopulationComplete(accepted, members);
  const migrationReviewStatus = accepted.length === members.length
    && accepted.every((member) => isVerifiedResult(member.result)) ? 'completed' : 'partial';
  return {
    status: complete ? 'completed' : 'partial',
    complete,
    migrationReviewStatus,
    results: accepted.map((member) => member.result || null),
    answer: accepted.map((member) => `## ${member.role}\n${populationAnswer(member)}`).join('\n\n')
  };
}

function modeStatus(mode, accepted, members, dispatchFailures) {
  if (mode === 'metapopulation') {
    return metapopulationComplete(accepted, members) ? 'completed' : 'partial';
  }
  return allWorkersCompleted(accepted, members, dispatchFailures) ? 'completed' : 'partial';
}

function buildBiologicalOutput({ context, mode, mission, members, accepted, topology }) {
  const dispatchFailures = context.dispatchFailures || [];
  const metapopulation = mode === 'metapopulation' ? buildMetapopulation(accepted, members) : {};
  return {
    orchestratorId: context.orchestratorId,
    biologicalMode: {
      status: modeStatus(mode, accepted, members, dispatchFailures),
      mode,
      mission,
      capacity: workerGarage.getDynamicCapacity(context.orchestratorId),
      mechanisms: collectMechanisms(members),
      ...topology,
      members: accepted,
      ...metapopulation
    }
  };
}

module.exports = { buildBiologicalOutput };