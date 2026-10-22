'use strict';

const { createFormalResult } = require('../formalResultService');
const { evaluateEpistemicAssurance } = require('../epistemicAssuranceService');
const verifierTrustRegistry = require('../verifierTrustRegistry');
const ontogenesisMemory = require('../ontogenesis/memoryService');
const confidenceCalibrator = require('../securityPerception/securityConfidenceCalibrator');
const {
  QUALIFICATION_DISPOSITIONS,
  learningError,
  sha256Prefixed,
  assertStageTransition,
} = require('./learningStageContract');

function computeTargetFingerprints(targetContext) {
  return {
    domainFingerprint: sha256Prefixed({
      alertClass: targetContext?.alertClass ?? '',
      environmentSignature: targetContext?.environment?.signature ?? 'env:default',
    }),
    constraintFingerprint: sha256Prefixed({
      constraints: [...(targetContext?.environment?.constraints ?? ['network:segmented'])].sort(),
    }),
  };
}

function assertMemoryEligibleForReuse(memoryRecord) {
  const allowed = memoryRecord?.validatedTruth === true
    || memoryRecord?.disposition === QUALIFICATION_DISPOSITIONS.FALSE_POSITIVE;
  if (!allowed) {
    throw learningError(
      'SECURITY_LEARNING_UNVALIDATED_REUSE_FORBIDDEN',
      'Cannot reuse an unvalidated memory record.',
    );
  }
}

function assertDomainAndConstraintsMatch(provenance, targetFingerprints) {
  const domainMatches = provenance.domainFingerprint === targetFingerprints.domainFingerprint;
  const constraintsMatch = provenance.constraintFingerprint === targetFingerprints.constraintFingerprint;
  if (!domainMatches || !constraintsMatch) {
    throw learningError(
      'SECURITY_LEARNING_REUSE_DOMAIN_MISMATCH',
      'Controlled reuse denied: target domain or security constraints do not match memory provenance.',
      { domainMatches, constraintsMatch },
    );
  }
}

function evaluateControlledReuse(session, store, reuseRequest = {}) {
  assertStageTransition(session.currentStage, 'controlled_reuse');
  const memoryRecord = reuseRequest.memoryRecord ?? session.memoryRecord;
  assertMemoryEligibleForReuse(memoryRecord);

  if (reuseRequest.intendedUse === 'modify_security_policy') {
    throw learningError(
      'SECURITY_POLICY_FRESH_VALIDATION_REQUIRED',
      'Controlled memory reuse cannot directly modify a security policy without a new independent validation.',
    );
  }

  const targetFingerprints = computeTargetFingerprints(reuseRequest.targetContext);
  assertDomainAndConstraintsMatch(memoryRecord.provenance, targetFingerprints);

  const failureReuseEntry = memoryRecord.disposition === QUALIFICATION_DISPOSITIONS.FALSE_POSITIVE
    ? {
        failureId: memoryRecord.provenance.negativeTrailId ?? memoryRecord.memoryId,
        status: 'applicable',
        domainFingerprint: targetFingerprints.domainFingerprint,
        constraintFingerprint: targetFingerprints.constraintFingerprint,
        witnessDigest: memoryRecord.provenance.evidenceDigest,
      }
    : null;

  const reuseReceipt = Object.freeze({
    reused: true,
    memoryId: memoryRecord.memoryId,
    disposition: memoryRecord.disposition,
    validatedTruth: memoryRecord.validatedTruth,
    failureReuseWitness: failureReuseEntry ? Object.freeze(failureReuseEntry) : null,
    autoIgnoreSimilarAlerts: false,
    canModifySecurityPolicyDirectly: false,
    reuseDigest: sha256Prefixed({
      memoryId: memoryRecord.memoryId,
      targetFingerprints,
      intendedUse: reuseRequest.intendedUse ?? 'triage_enrichment',
    }),
  });

  session.currentStage = 'controlled_reuse';
  session.stageHistory.push('controlled_reuse');
  return reuseReceipt;
}

function evaluateAlertConfidenceWithHistory(store, alertInput = {}) {
  const alertClass = String(alertInput.alertClass ?? '').trim();
  const rawConfidence = Number(alertInput.rawConfidence ?? 0.75);
  if (!alertClass) {
    throw learningError('SECURITY_LEARNING_ALERT_INVALID', 'alertClass is required.');
  }

  const history = store.falsePositiveHistoryByClass.get(alertClass) ?? [];
  const priorFalsePositiveCount = history.length;
  const calibration = confidenceCalibrator.calibrate(store.calibrationState, alertClass, rawConfidence);

  const similarFailures = store.ontogenesisEntries.filter(
    (entry) => entry.kind === 'failure'
      && ontogenesisMemory.similarity(entry.content, alertInput.summary ?? alertClass) >= 0.3,
  );

  // Penalty bounded to [0.05, 0.45] so confidence is lowered by prior false positives
  // without ever dropping to 0 or automatically suppressing the alert.
  const fpPenalty = Math.min(0.45, priorFalsePositiveCount * 0.12);
  const blended = priorFalsePositiveCount > 0
    ? Math.max(0.15, Math.min(rawConfidence - fpPenalty, calibration.calibrated))
    : rawConfidence;
  const adjustedConfidence = Number(blended.toFixed(4));

  return Object.freeze({
    alertClass,
    rawConfidence,
    adjustedConfidence,
    confidenceReduced: adjustedConfidence < rawConfidence,
    priorFalsePositiveCount,
    similarNegativeMemories: similarFailures.length,
    autoIgnore: false,
    suppressed: false,
    mustInvestigate: true,
    recommendedDisposition: priorFalsePositiveCount > 0 ? 'investigate_with_fp_context' : 'standard_investigation',
  });
}

function buildPolicyChangeFormalResult(proposal, policyDiffDigest) {
  return createFormalResult({
    canonicalStatement: `Security policy modification '${proposal.policyId}' (${proposal.policyType}) is safe and verified.`,
    assumptions: [
      { id: 'policy_diff_bound', statement: `Bound to policyDiffDigest ${policyDiffDigest}` },
    ],
    validityDomain: {
      statement: `Policy scope ${proposal.targetScope ?? 'global'}`,
      constraints: [...(proposal.constraints ?? ['change_control:enforced'])],
    },
    dependencies: [],
    status: 'verified',
    evidence: {
      kind: 'proof',
      content: {
        policyId: proposal.policyId,
        policyType: proposal.policyType,
        policyDiffDigest,
        proposedChanges: proposal.proposedChanges,
      },
    },
    provenance: {
      createdAt: proposal.proposedAt ?? new Date().toISOString(),
      actor: proposal.proposerId ?? 'agent:remediation_planner',
      source: {
        type: 'security_policy_proposal',
        uri: `genos://policy-change/${proposal.policyId}`,
        digest: policyDiffDigest,
      },
      inputs: [{ id: proposal.policyId, digest: policyDiffDigest }],
      transformations: ['policy_proposal_to_independent_verification'],
    },
    producer: { model: 'genos-security-policy-gate', version: '1.0.0' },
  });
}

function assertPolicyProposalInput(proposal, validationInput) {
  const hasFields = Boolean(proposal.policyId && proposal.policyType && proposal.proposedChanges);
  if (!hasFields) {
    throw learningError(
      'SECURITY_POLICY_PROPOSAL_INVALID',
      'Policy modification proposal requires policyId, policyType, and proposedChanges.',
    );
  }
  if (validationInput.investigationSessionId && validationInput.reusedInvestigationValidation === true) {
    throw learningError(
      'SECURITY_POLICY_REUSED_VALIDATION_FORBIDDEN',
      'Security policy modifications cannot reuse an investigation validation receipt; a new independent validation is required.',
    );
  }
}

function resolveFreshPolicyReceipts(validationInput, policyFormalResult, policyDiffDigest) {
  const receipts = typeof validationInput.buildFreshReceipts === 'function'
    ? validationInput.buildFreshReceipts(policyFormalResult, policyDiffDigest)
    : (validationInput.freshVerifierReceipts ?? []);
  if (!Array.isArray(receipts) || receipts.length === 0) {
    throw learningError(
      'SECURITY_POLICY_FRESH_VALIDATION_REQUIRED',
      'Security policy modification requires fresh independent verifier receipts.',
    );
  }
  const verdict = String(validationInput.independentAuditorVerdict ?? '').toLowerCase();
  if (verdict !== 'accept') {
    throw learningError(
      'SECURITY_POLICY_INDEPENDENT_AUDIT_REJECTED',
      `Security policy modification requires independentAuditorVerdict='accept' (got '${verdict}').`,
    );
  }
  return receipts;
}

function evaluatePolicyAeisAssurance(proposal, policyFormalResult, receipts) {
  const proposerId = proposal.proposerId ?? 'agent:remediation_planner';
  const attestations = receipts
    .filter((r) => Boolean(r?.independent === true && r?.independenceDescriptor?.actorId))
    .map((r) => ({
      actorId: r.independenceDescriptor.actorId,
      obligationIds: [policyFormalResult.resultId],
      independent: true,
    }));

  const aeisEvaluation = evaluateEpistemicAssurance({
    results: [policyFormalResult],
    obligations: [{ id: policyFormalResult.resultId, required: true }],
    coverage: [{
      resultId: policyFormalResult.resultId,
      obligationId: policyFormalResult.resultId,
      evidenceDigest: policyFormalResult.evidence.digest,
    }],
    constraintAttestations: attestations,
    verifications: receipts,
    compositionRoots: [policyFormalResult.resultId],
    trustedVerifierDigests: verifierTrustRegistry.listVerifierDigests(),
    workerIds: [proposerId],
    contributions: [{
      workerId: proposerId,
      usedResultIds: [policyFormalResult.resultId],
      decisionWitness: policyFormalResult.provenance.source.digest,
    }],
  });

  if (!aeisEvaluation.eligible) {
    throw learningError(
      'SECURITY_POLICY_AEIS_ASSURANCE_FAILED',
      'Security policy modification failed fresh AEIS independent assurance.',
      { violations: aeisEvaluation.violations },
    );
  }
  return aeisEvaluation;
}

function validateSecurityPolicyModification(proposal = {}, validationInput = {}) {
  assertPolicyProposalInput(proposal, validationInput);
  const policyDiffDigest = proposal.policyDiffDigest ?? sha256Prefixed({
    policyId: proposal.policyId,
    policyType: proposal.policyType,
    proposedChanges: proposal.proposedChanges,
  });

  const policyFormalResult = buildPolicyChangeFormalResult(proposal, policyDiffDigest);
  const receipts = resolveFreshPolicyReceipts(validationInput, policyFormalResult, policyDiffDigest);
  const aeisEvaluation = evaluatePolicyAeisAssurance(proposal, policyFormalResult, receipts);

  return Object.freeze({
    approved: true,
    policyId: proposal.policyId,
    policyType: proposal.policyType,
    policyDiffDigest,
    formalResultId: policyFormalResult.resultId,
    aeisAssemblyDigest: aeisEvaluation.assemblyDigest,
    independentAuditorVerdict: 'accept',
  });
}

module.exports = {
  evaluateControlledReuse,
  evaluateAlertConfidenceWithHistory,
  validateSecurityPolicyModification,
};
