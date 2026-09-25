'use strict';

const topologyCapabilities = require('./topologyCapabilityService');
const comparativeEvaluation = require('./comparativeMissionEvaluationService');

function evaluateMissionResult(input) {
  const topology = topologyCapabilities.capabilitiesForMode(input.topology);
  if (!topology) {
    throw Object.assign(new Error(`Unknown topology '${input.topology}'.`), { code: 'TOPOLOGY_UNKNOWN' });
  }
  const evaluation = comparativeEvaluation.evaluateFixtureSubmission({
    fixtureId: input.fixtureId, submission: input.submission,
    answer: input.answer, method: input.method
  });
  return {
    topology: topology.topology,
    evaluation,
    migrationPolicy: topology.topology === 'metapopulation' ? 'receiver-local-validation' : 'not-applicable'
  };
}

module.exports = { evaluateMissionResult };
