'use strict';

function completionGate(context) {
if (context.verifierReceiptPresent) {
    context.context.context.evidence.push('independent_verifier_receipt');
    if (context.rootVerified && context.participantsVerified) {
      context.context.context.missionOutcome = true;
      context.context.context.flags.missionOutcome = true;
      context.context.context.flags.completionContractConfigured = context.Boolean(
        context.require('./missionCompletionRules.js').completionGateRule3({ get context() { return context.context; }, request: context.request })
      );
      const proof = { schema: 'genos.ontogenesis-agent-completion-proof/v1',
        missionId: context.request.missionId || context.request.id, orchestratorId: context.request.id,
        candidateTreeHash: context.verifierReceipt.treeHash,
        agentIds: context.agents.map((agent) => agent.id).filter(context.Boolean).sort(),
        completionVerified: true };
      proof.payloadHash = context.digest(proof);
      context.context.context.ontogenesisRuntimeCompletionProof = proof;
    }
  }
}

module.exports = { completionGate };
