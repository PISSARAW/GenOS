'use strict';

function ontogenesisRuntimeExecutionValue1(__genosValueScope1) {
  return __genosValueScope1.proof?.schema !== 'genos.ontogenesis-agent-completion-proof/v1'
      || __genosValueScope1.proof.missionId !== __genosValueScope1.mission.missionId || __genosValueScope1.proof.completionVerified !== true
      || !__genosValueScope1.Array.isArray(__genosValueScope1.proof.agentIds) || __genosValueScope1.proof.agentIds.length === 0
      || !/^[a-f0-9]{64}$/i.test(__genosValueScope1.proof.candidateTreeHash || '');
}

module.exports = { ontogenesisRuntimeExecutionValue1 };
