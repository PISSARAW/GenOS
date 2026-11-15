'use strict';

function ontogenesisRuntimeExecution(context) {
  return context.proof?.schema !== 'genos.ontogenesis-agent-completion-proof/v1'
      || context.proof.missionId !== context.mission.missionId || context.proof.completionVerified !== true
      || !context.Array.isArray(context.proof.agentIds) || context.proof.agentIds.length === 0
      || !/^[a-f0-9]{64}$/i.test(context.proof.candidateTreeHash || '');
}

module.exports = { ontogenesisRuntimeExecution };
