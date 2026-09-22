'use strict';

function buildGateContext({ promotion, options, receipt, aeisEvaluation }) {
  return {
    agentId: options.agentId || promotion.agentId,
    report: promotion.report,
    replayReceipt: options.replayReceipt,
    independentVerification: options.independentVerification,
    evidenceVerified: options.evidenceVerified,
    verifiedClaims: options.verifiedClaims,
    workerDossiers: options.workerDossiers,
    philosophyEvidence: options.philosophyEvidence,
    philosophyProvenanceVerified: options.philosophyProvenanceVerified,
    epistemicEvidence: options.epistemicEvidence,
    epistemicEvidenceVerified: options.epistemicEvidenceVerified,
    epistemicVerification: options.epistemicVerification,
    ethicalReview: options.ethicalReview,
    humanApprovalReceipt: receipt || options.humanApprovalReceipt || null,
    aeisEvaluation,
  };
}

module.exports = { buildGateContext };
