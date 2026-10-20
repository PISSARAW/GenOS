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

function buildBiologicalOutput(input) {
  const { context, mode, mission, members, accepted, topology } = input || {};
  const dispatchFailures = context.dispatchFailures || [];
  const metapopulation = mode === 'metapopulation' ? buildMetapopulation(accepted, members) : {};
  const status = mode === 'metapopulation'
    ? (metapopulationComplete(accepted, members) ? 'completed' : 'partial')
    : (allWorkersCompleted(accepted, members, dispatchFailures) ? 'completed' : 'partial');
  return {
    orchestratorId: context.orchestratorId,
    biologicalMode: {
      status,
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
