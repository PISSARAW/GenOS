'use strict';

function assemblyFromAeis(aeisEvaluation, options, promotion) {
  if (aeisEvaluation && aeisEvaluation.assembly) return aeisEvaluation.assembly;
  if (options && options.epistemicAssembly) return options.epistemicAssembly;
  if (promotion && promotion.report && promotion.report.epistemicAssembly) return promotion.report.epistemicAssembly;
  return null;
}

function digestsFromAssembly(assembly, options) {
  if (assembly && Array.isArray(assembly.trustedVerifierDigests)) return assembly.trustedVerifierDigests;
  if (options && Array.isArray(options.trustedVerifierDigests)) return options.trustedVerifierDigests;
  return [];
}

function collectCandidateReceipts(aeisEvaluation) {
  const assemblyReceipts = aeisEvaluation?.assembly?.verifications;
  if (Array.isArray(assemblyReceipts)) return assemblyReceipts;
  const holobionte = aeisEvaluation?.holobionteResults || [];
  const out = [];
  for (const hr of holobionte) {
    const items = hr?.immune?.verifierResults?.results || [];
    for (const item of items) {
      if (item?.receipt?.signature) out.push(item.receipt);
    }
  }
  return out;
}

function selectIndependentReceipt(aeisEvaluation) {
  const candidates = collectCandidateReceipts(aeisEvaluation);
  return candidates.find((r) => r.independent === true && r.signature) || null;
}

function buildGateContext({ promotion, options, receipt, aeisEvaluation }) {
  const epistemicAssembly = assemblyFromAeis(aeisEvaluation, options, promotion);
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
    epistemicAssembly,
    trustedVerifierDigests: digestsFromAssembly(epistemicAssembly, options),
    independentVerifierReceipt: selectIndependentReceipt(aeisEvaluation) || options.independentVerifierReceipt || null,
  };
}

module.exports = { buildGateContext, selectIndependentReceipt };
