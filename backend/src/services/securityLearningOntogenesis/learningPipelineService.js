'use strict';

const { createFormalResult } = require('../formalResultService');
const { evaluateEpistemicAssurance } = require('../epistemicAssuranceService');
const verifierTrustRegistry = require('../verifierTrustRegistry');
const hypothesisEngine = require('../securityPerception/securityHypothesisEngine');
const {
  QUALIFICATION_DISPOSITIONS,
  learningError,
  sha256Prefixed,
  assertStageTransition,
  verifyArtifactWithGvx,
} = require('./learningStageContract');

function createLearningSession(options = {}) {
  return {
    sessionId: options.sessionId ?? `sec-learn-${Date.now()}`,
    projectId: options.projectId ?? 'security-ontogenesis',
    organizationId: options.organizationId ?? 'org-security',
    entityId: options.entityId ?? 'security-investigator',
    authorId: options.authorId ?? 'agent:threat_analyst',
    currentStage: null,
    stageHistory: [],
    observation: null,
    hypothesis: null,
    testRecord: null,
    verification: null,
    qualification: null,
    memoryRecord: null,
  };
}

function buildEnvironmentSpec(envInput = {}) {
  return Object.freeze({
    signature: envInput.signature ?? 'env:default',
    conditions: Object.freeze({ ...(envInput.conditions ?? {}) }),
    constraints: Object.freeze([...(envInput.constraints ?? ['network:segmented'])]),
  });
}

function recordObservation(session, observationInput = {}) {
  assertStageTransition(session.currentStage, 'observation');
  const evidenceRefs = Array.isArray(observationInput.evidenceRefs) ? observationInput.evidenceRefs : [];
  if (!observationInput.alertClass || evidenceRefs.length === 0) {
    throw learningError(
      'SECURITY_LEARNING_OBSERVATION_INVALID',
      'Observation requires alertClass and non-empty evidenceRefs.',
    );
  }
  const observation = Object.freeze({
    observationId: observationInput.observationId ?? `obs:${sha256Prefixed(observationInput).slice(7, 23)}`,
    alertClass: String(observationInput.alertClass).trim(),
    summary: String(observationInput.summary ?? observationInput.alertClass).trim(),
    evidenceRefs: Object.freeze([...evidenceRefs]),
    rawConfidence: Number(observationInput.rawConfidence ?? 0.7),
    environment: buildEnvironmentSpec(observationInput.environment),
    observedAt: observationInput.observedAt ?? new Date().toISOString(),
  });
  session.observation = observation;
  session.currentStage = 'observation';
  session.stageHistory.push('observation');
  return observation;
}

function buildFormalResultForStage(session, stageSpec) {
  const obs = session.observation;
  return createFormalResult({
    canonicalStatement: stageSpec.statement,
    assumptions: [
      { id: 'env_signature', statement: `Environment signature is ${obs.environment.signature}` },
    ],
    validityDomain: {
      statement: `Security domain for ${obs.alertClass}`,
      constraints: [...obs.environment.constraints],
    },
    dependencies: [],
    status: stageSpec.status,
    evidence: stageSpec.evidence,
    provenance: {
      createdAt: obs.observedAt,
      actor: session.authorId,
      source: {
        type: 'deo_observation',
        uri: `genos://observation/${obs.observationId}`,
        digest: sha256Prefixed(obs),
      },
      inputs: obs.evidenceRefs.map((ref) => ({ id: ref, digest: sha256Prefixed(ref) })),
      transformations: stageSpec.transformations,
    },
    producer: { model: 'genos-security-ontogenesis', version: '1.0.0' },
  });
}

function resolveHypothesisText(hypothesisInput, generated) {
  const first = generated[0] ?? {};
  const statement = String(hypothesisInput.statement ?? first.statement ?? '').trim();
  const falsifier = String(hypothesisInput.falsifier ?? first.falsifier ?? '').trim();
  if (!statement || !falsifier) {
    throw learningError('SECURITY_LEARNING_HYPOTHESIS_INVALID', 'Hypothesis requires statement and falsifier.');
  }
  return { statement, falsifier, defaultId: first.id };
}

function formulateHypothesis(session, hypothesisInput = {}) {
  assertStageTransition(session.currentStage, 'hypothesis');
  const obs = session.observation;
  const generated = hypothesisEngine.build(
    { evidence: obs.evidenceRefs, confidence: obs.rawConfidence },
    { correlation: hypothesisInput.correlation ?? obs.summary },
  );
  const { statement, falsifier, defaultId } = resolveHypothesisText(hypothesisInput, generated);
  const conjectureResult = buildFormalResultForStage(session, {
    statement,
    status: 'conjecture',
    evidence: {
      kind: 'reproducible_artifact',
      content: { observationId: obs.observationId, evidenceRefs: obs.evidenceRefs },
      reproduction: {
        command: hypothesisInput.reproductionCommand ?? 'genos inspect --observation',
        environment: obs.environment.signature,
      },
    },
    transformations: ['observation_to_hypothesis'],
  });

  const hypothesis = Object.freeze({
    hypothesisId: hypothesisInput.hypothesisId ?? defaultId ?? `hyp:${conjectureResult.resultId.slice(7, 23)}`,
    statement,
    falsifier,
    candidateHypotheses: Object.freeze(generated),
    conjectureResult: Object.freeze(conjectureResult),
    validatedTruth: false,
  });
  session.hypothesis = hypothesis;
  session.currentStage = 'hypothesis';
  session.stageHistory.push('hypothesis');
  return hypothesis;
}

async function executeHypothesisTest(session, testInput = {}) {
  assertStageTransition(session.currentStage, 'test');
  if (!Array.isArray(testInput.protocolSteps) || testInput.protocolSteps.length === 0) {
    throw learningError('SECURITY_LEARNING_TEST_INVALID', 'Hypothesis test requires non-empty protocolSteps.');
  }
  const outcome = String(testInput.outcome ?? '').toLowerCase();
  if (!['corroborated', 'refuted', 'inconclusive'].includes(outcome)) {
    throw learningError('SECURITY_LEARNING_TEST_OUTCOME_INVALID', 'Test outcome must be corroborated, refuted, or inconclusive.');
  }
  const artifactPayload = {
    hypothesisId: session.hypothesis.hypothesisId,
    protocolSteps: testInput.protocolSteps,
    measurements: testInput.measurements ?? [],
    outcome,
  };
  const gvxReceipt = await verifyArtifactWithGvx(
    artifactPayload,
    `gvx:test:${session.hypothesis.hypothesisId}`,
  );
  const testRecord = Object.freeze({
    testId: testInput.testId ?? `test:${gvxReceipt.rawArtifactHash.slice(0, 16)}`,
    protocolSteps: Object.freeze([...testInput.protocolSteps]),
    measurements: Object.freeze([...(testInput.measurements ?? [])]),
    counterexample: testInput.counterexample ?? null,
    outcome,
    gvxReceipt,
    validatedTruth: false,
  });
  session.testRecord = testRecord;
  session.currentStage = 'test';
  session.stageHistory.push('test');
  return testRecord;
}

function buildTerminalFormalResult(session) {
  const testOutcome = session.testRecord.outcome;
  if (testOutcome === 'corroborated') {
    return buildFormalResultForStage(session, {
      statement: session.hypothesis.statement,
      status: 'verified',
      evidence: {
        kind: 'proof',
        content: {
          testId: session.testRecord.testId,
          gvxArtifactHash: session.testRecord.gvxReceipt.artifactHash,
          evidenceRefs: session.observation.evidenceRefs,
        },
      },
      transformations: ['observation_to_hypothesis', 'hypothesis_to_test', 'test_to_proof'],
    });
  }
  if (testOutcome === 'refuted') {
    return buildFormalResultForStage(session, {
      statement: session.hypothesis.statement,
      status: 'refuted',
      evidence: {
        kind: 'counterexample',
        content: {
          testId: session.testRecord.testId,
          counterexample: session.testRecord.counterexample ?? session.hypothesis.falsifier,
          gvxArtifactHash: session.testRecord.gvxReceipt.artifactHash,
        },
      },
      transformations: ['observation_to_hypothesis', 'hypothesis_to_test', 'test_to_counterexample'],
    });
  }
  return session.hypothesis.conjectureResult;
}

function verifyInvestigation(session, verificationInput = {}) {
  assertStageTransition(session.currentStage, 'verification');
  const formalResult = buildTerminalFormalResult(session);
  const suppliedReceipts = typeof verificationInput.buildReceipts === 'function'
    ? verificationInput.buildReceipts(formalResult)
    : (verificationInput.verifierReceipts ?? []);

  const constraintAttestations = suppliedReceipts
    .filter((r) => r?.independent === true && r?.independenceDescriptor?.actorId)
    .map((r) => ({
      actorId: r.independenceDescriptor.actorId,
      obligationIds: [formalResult.resultId],
      independent: true,
    }));

  const aeisEvaluation = evaluateEpistemicAssurance({
    results: [formalResult],
    obligations: [{ id: formalResult.resultId, required: true }],
    coverage: [{
      resultId: formalResult.resultId,
      obligationId: formalResult.resultId,
      evidenceDigest: formalResult.evidence.digest,
    }],
    constraintAttestations,
    verifications: suppliedReceipts,
    compositionRoots: [formalResult.resultId],
    relations: verificationInput.relations ?? [],
    contradictionResolutions: verificationInput.contradictionResolutions ?? [],
    trustedVerifierDigests: verifierTrustRegistry.listVerifierDigests(),
    workerIds: [session.authorId],
    contributions: [{
      workerId: session.authorId,
      usedResultIds: [formalResult.resultId],
      decisionWitness: session.testRecord.gvxReceipt.artifactHash,
    }],
  });

  const verification = Object.freeze({
    formalResult: Object.freeze(formalResult),
    aeisEvaluation: Object.freeze(aeisEvaluation),
    verifierReceipts: Object.freeze([...suppliedReceipts]),
    independentlyVerified: aeisEvaluation.eligible === true,
  });
  session.verification = verification;
  session.currentStage = 'verification';
  session.stageHistory.push('verification');
  return verification;
}

function resolveDisposition(session) {
  const verified = session.verification.independentlyVerified;
  const outcome = session.testRecord.outcome;
  if (!verified) {
    return QUALIFICATION_DISPOSITIONS.UNVALIDATED_CONJECTURE;
  }
  if (outcome === 'corroborated') {
    return QUALIFICATION_DISPOSITIONS.CONFIRMED_INCIDENT;
  }
  if (outcome === 'refuted') {
    return QUALIFICATION_DISPOSITIONS.FALSE_POSITIVE;
  }
  return QUALIFICATION_DISPOSITIONS.UNVALIDATED_CONJECTURE;
}

function qualifyInvestigation(session, qualificationInput = {}) {
  assertStageTransition(session.currentStage, 'qualification');
  const disposition = resolveDisposition(session);
  if (qualificationInput.forceValidatedTruth === true && disposition !== QUALIFICATION_DISPOSITIONS.CONFIRMED_INCIDENT) {
    throw learningError(
      'SECURITY_LEARNING_UNVALIDATED_TRUTH_FORBIDDEN',
      'Cannot qualify an unverified or refuted investigation as a validated truth.',
    );
  }
  const qualification = Object.freeze({
    disposition,
    validatedTruth: disposition === QUALIFICATION_DISPOSITIONS.CONFIRMED_INCIDENT,
    isFalsePositive: disposition === QUALIFICATION_DISPOSITIONS.FALSE_POSITIVE,
    eligibleForTruthMemory: disposition === QUALIFICATION_DISPOSITIONS.CONFIRMED_INCIDENT,
    eligibleForNegativeMemory: disposition === QUALIFICATION_DISPOSITIONS.FALSE_POSITIVE,
    severity: qualificationInput.severity ?? 'medium',
    qualifiedAt: new Date().toISOString(),
  });
  session.qualification = qualification;
  session.currentStage = 'qualification';
  session.stageHistory.push('qualification');
  return qualification;
}

module.exports = {
  createLearningSession,
  recordObservation,
  formulateHypothesis,
  executeHypothesisTest,
  verifyInvestigation,
  qualifyInvestigation,
};
