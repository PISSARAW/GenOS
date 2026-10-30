'use strict';

function completionGateStage1(__genosStageScope1) {
if (__genosStageScope1.verifierReceiptPresent) {
    __genosStageScope1.context.context.evidence.push('independent_verifier_receipt');
    if (__genosStageScope1.rootVerified && __genosStageScope1.participantsVerified) {
      __genosStageScope1.context.context.missionOutcome = true;
      __genosStageScope1.context.context.flags.missionOutcome = true;
      __genosStageScope1.context.context.flags.completionContractConfigured = (0, __genosStageScope1.Boolean)(
        (0, __genosStageScope1.require)('./missionCompletionValues1.js').completionGateValue3({ get context() { return __genosStageScope1.context; }, request: __genosStageScope1.request })
      );
      const proof = { schema: 'genos.ontogenesis-agent-completion-proof/v1',
        missionId: __genosStageScope1.request.missionId || __genosStageScope1.request.id, orchestratorId: __genosStageScope1.request.id,
        candidateTreeHash: __genosStageScope1.verifierReceipt.treeHash,
        agentIds: __genosStageScope1.agents.map((agent) => agent.id).filter(__genosStageScope1.Boolean).sort(),
        completionVerified: true };
      proof.payloadHash = (0, __genosStageScope1.digest)(proof);
      __genosStageScope1.context.context.ontogenesisRuntimeCompletionProof = proof;
    }
  }
}

module.exports = { completionGateStage1 };
