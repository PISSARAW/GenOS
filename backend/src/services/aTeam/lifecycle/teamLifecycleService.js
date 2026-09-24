'use strict';

const { compilePrebrief } = require('./teamPrebriefService');
const { sealTeamContract } = require('./teamContractService');
const { evaluateReadiness } = require('./teamReadinessGate');

function prepareTeamLifecycle(input = {}) {
  const prebrief = compilePrebrief(input);
  const teamContract = sealTeamContract(prebrief);
  const readiness = evaluateReadiness(teamContract, input);
  return { prebrief, teamContract, readiness };
}

module.exports = { prepareTeamLifecycle };
