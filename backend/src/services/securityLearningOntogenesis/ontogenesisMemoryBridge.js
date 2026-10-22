'use strict';

const { NegativeSearchMemory } = require('../search/negativeSearchMemoryService');
const ontogenesisMemory = require('../ontogenesis/memoryService');
const confidenceCalibrator = require('../securityPerception/securityConfidenceCalibrator');
const incidentMemory = require('../securityPerception/securityIncidentMemory');
const gvxLedger = require('../gvxDevelopmentLedger');
const {
  QUALIFICATION_DISPOSITIONS,
  learningError,
  sha256Prefixed,
  assertStageTransition,
} = require('./learningStageContract');

function createSecurityLearningStore() {
  return {
    negativeMemory: new NegativeSearchMemory(),
    calibrationState: { calibration: {} },
    incidentState: { incidents: {} },
    ontogenesisEntries: [],
    falsePositiveHistoryByClass: new Map(),
  };
}

function buildDomainFingerprints(session) {
  const obs = session.observation;
  return {
    domainFingerprint: sha256Prefixed({
      alertClass: obs.alertClass,
      environmentSignature: obs.environment.signature,
    }),
    constraintFingerprint: sha256Prefixed({
      constraints: [...obs.environment.constraints].sort(),
    }),
  };
}

async function persistOntogenesisEntry(store, entry, db) {
  store.ontogenesisEntries.push(entry);
  if (db && typeof db.run === 'function') {
    await ontogenesisMemory.recordMemory(db, entry);
  }
}

async function appendGvxDecisionIfDbPresent(session, memoryRecord, db) {
  if (!db || typeof db.run !== 'function' || typeof db.all !== 'function') {
    return null;
  }
  return gvxLedger.appendEvent(db, {
    organizationId: session.organizationId,
    projectId: session.projectId,
    entityId: session.entityId,
    type: 'decision_recorded',
    candidateHash: session.testRecord.gvxReceipt.rawArtifactHash,
    payload: {
      memoryId: memoryRecord.memoryId,
      disposition: memoryRecord.disposition,
      aeisAssemblyDigest: memoryRecord.provenance.aeisAssemblyDigest,
    },
  });
}

function recordFalsePositiveInStore(store, session, fingerprints) {
  const obs = session.observation;
  const hyp = session.hypothesis;
  const trail = store.negativeMemory.recordFailure(
    session.authorId,
    { id: hyp.hypothesisId, statement: hyp.statement },
    {
      ref: session.verification.formalResult.resultId,
      strength: 0.85,
      reliability: 0.9,
    },
    {
      signature: obs.environment.signature,
      conditions: obs.environment.conditions,
      scope: 'security_ontogenesis',
    },
  );
  confidenceCalibrator.recordOutcome(store.calibrationState, obs.alertClass, false);
  const existing = store.falsePositiveHistoryByClass.get(obs.alertClass) ?? [];
  existing.push({
    trailId: trail.id,
    hypothesisId: hyp.hypothesisId,
    statement: hyp.statement,
    conditions: obs.environment.conditions,
    environmentSignature: obs.environment.signature,
    domainFingerprint: fingerprints.domainFingerprint,
    constraintFingerprint: fingerprints.constraintFingerprint,
    witnessDigest: session.verification.formalResult.evidence.digest,
    recordedAt: new Date().toISOString(),
  });
  store.falsePositiveHistoryByClass.set(obs.alertClass, existing);
  return trail;
}

function recordConfirmedTruthInStore(store, session) {
  confidenceCalibrator.recordOutcome(store.calibrationState, session.observation.alertClass, true);
}

function assertQualificationAllowsMemoryCommit(qual, options) {
  const isUnvalidated = !qual || qual.disposition === QUALIFICATION_DISPOSITIONS.UNVALIDATED_CONJECTURE;
  if (!isUnvalidated) {
    return;
  }
  const requestedKind = options.requestedKind ?? null;
  const asksTruthKind = requestedKind === 'decision' || requestedKind === 'constraint';
  if (options.allowUnvalidatedQuestion !== true || asksTruthKind) {
    throw learningError(
      'SECURITY_LEARNING_UNVALIDATED_TRUTH_FORBIDDEN',
      'Unvalidated or unverified investigation results cannot be committed into memory as truths.',
    );
  }
}

function applyQualificationToStore(store, session, options) {
  const qual = session.qualification;
  const fingerprints = buildDomainFingerprints(session);
  if (qual.disposition === QUALIFICATION_DISPOSITIONS.CONFIRMED_INCIDENT) {
    recordConfirmedTruthInStore(store, session);
    return {
      ontogenesisKind: options.requestedKind === 'constraint' ? 'constraint' : 'decision',
      negativeTrail: null,
      fingerprints,
    };
  }
  if (qual.disposition === QUALIFICATION_DISPOSITIONS.FALSE_POSITIVE) {
    return {
      ontogenesisKind: 'failure',
      negativeTrail: recordFalsePositiveInStore(store, session, fingerprints),
      fingerprints,
    };
  }
  return { ontogenesisKind: 'question', negativeTrail: null, fingerprints };
}

async function commitToOntogenesisMemory(session, store, options = {}) {
  assertStageTransition(session.currentStage, 'memory');
  const qual = session.qualification;
  assertQualificationAllowsMemoryCommit(qual, options);
  const { ontogenesisKind, negativeTrail, fingerprints } = applyQualificationToStore(store, session, options);

  const incidentEntry = incidentMemory.record(store.incidentState, {
    incidentId: session.sessionId,
    disposition: qual.disposition,
    cause: session.hypothesis.statement,
    falsePositive: qual.isFalsePositive,
    evidenceRefs: [...session.observation.evidenceRefs],
    timeline: [...session.stageHistory, 'memory'],
  });

  const provenance = Object.freeze({
    sessionId: session.sessionId,
    disposition: qual.disposition,
    validatedTruth: qual.validatedTruth,
    formalResultId: session.verification.formalResult.resultId,
    semanticFingerprint: session.verification.formalResult.semanticFingerprint,
    evidenceDigest: session.verification.formalResult.evidence.digest,
    aeisAssemblyDigest: session.verification.aeisEvaluation.assemblyDigest,
    aeisEligible: session.verification.aeisEvaluation.eligible,
    gvxArtifactHash: session.testRecord.gvxReceipt.artifactHash,
    domainFingerprint: fingerprints.domainFingerprint,
    constraintFingerprint: fingerprints.constraintFingerprint,
    negativeTrailId: negativeTrail?.id ?? null,
  });

  const memoryId = `mem:${sha256Prefixed({ sessionId: session.sessionId, provenance }).slice(7, 23)}`;
  const ontogenesisEntry = Object.freeze({
    id: memoryId,
    projectId: session.projectId,
    kind: ontogenesisKind,
    alertClass: session.observation.alertClass,
    content: session.hypothesis.statement,
    validatedTruth: qual.validatedTruth,
    provenance,
  });

  await persistOntogenesisEntry(store, ontogenesisEntry, options.db);
  const gvxLedgerEvent = await appendGvxDecisionIfDbPresent(
    session,
    { memoryId, disposition: qual.disposition, provenance },
    options.db,
  );

  const memoryRecord = Object.freeze({
    memoryId,
    kind: ontogenesisKind,
    disposition: qual.disposition,
    validatedTruth: qual.validatedTruth,
    ontogenesisEntry,
    negativeTrail,
    incidentEntry,
    gvxLedgerEvent,
    provenance,
  });

  session.memoryRecord = memoryRecord;
  session.currentStage = 'memory';
  session.stageHistory.push('memory');
  return memoryRecord;
}

module.exports = {
  createSecurityLearningStore,
  buildDomainFingerprints,
  commitToOntogenesisMemory,
};
