'use strict';

const {
  DEO_SCHEMA,
  DEO_DOSSIER_SCHEMA,
  DEO_OBSERVATION_SCHEMA,
  DEO_BINARY_MAGIC,
  SUPPORTED_FORMATS,
  RETENTION_TIERS,
  deoError,
  sha256Hex,
  sha256Digest,
  canonicalJson,
  canonicalDigest,
  encodeTypedBinary,
  decodeTypedBinary,
} = require('./deoContract');
const { ingestArtifact } = require('./evidenceIngestion');
const { KNOWN_EVTX_EVENT_IDS, normalizeIngestedArtifact } = require('./evidenceNormalizer');
const { computeSourceSignature, verifySourceAuthenticity, attachProvenance } = require('./evidenceProvenance');
const { correlateObservations } = require('./evidenceCorrelator');
const { recomputeObservationHash, verifyEvidenceIntegrity } = require('./evidenceIntegrityVerifier');
const { resolveEvidenceConflicts } = require('./evidenceConflictResolver');
const { applyEvidenceRetention, pseudonymizeValue } = require('./evidenceRetention');
const { canonicalValue } = require('../stateFingerprint');

function ingestSingleArtifactEntry(entry, state, options) {
  const ingested = ingestArtifact(entry);
  state.rawVault.set(ingested.artifactId, Object.freeze({
    artifactId: ingested.artifactId,
    format: ingested.format,
    rawBytes: ingested.rawBytes,
    rawByteLength: ingested.rawByteLength,
    rawHash: ingested.rawHash,
  }));
  const normalized = normalizeIngestedArtifact(ingested);
  const withProvenance = attachProvenance(ingested, normalized, {
    trustPolicy: options.trustPolicy,
    parentHash: state.headProvenanceHash,
    organizationId: options.organizationId,
    projectId: options.projectId,
  });
  state.headProvenanceHash = withProvenance.headProvenanceHash;
  state.duplicateCount += normalized.duplicateCount;
  state.allObservations.push(...withProvenance.observations);
  state.ingestedArtifacts.push({
    artifactId: ingested.artifactId,
    format: ingested.format,
    rawHash: ingested.rawHash,
    rawByteLength: ingested.rawByteLength,
    observationCount: withProvenance.observations.length,
    duplicateCount: normalized.duplicateCount,
  });
}

function recordRejection(entry, err, state) {
  state.rejectedArtifacts.push({
    artifactId: entry?.artifactId ?? 'unknown',
    format: entry?.format ?? 'unknown',
    code: err.code ?? 'DEO_INGESTION_REJECTED',
    reason: err.message,
    promotionAllowed: false,
  });
}

function dedupeCrossArtifactObservations(observations) {
  const seen = new Map();
  let crossDuplicates = 0;
  for (const obs of observations) {
    if (seen.has(obs.observationHash)) {
      crossDuplicates++;
    } else {
      seen.set(obs.observationHash, obs);
    }
  }
  return { uniqueObservations: [...seen.values()], crossDuplicates };
}

function buildPromotionGate(rejectedArtifacts, integrity, conflicts) {
  const hasRejections = rejectedArtifacts.length > 0;
  const reasons = [];
  if (hasRejections) reasons.push('rejected_or_corrupted_artifacts_present');
  if (!integrity.intact) reasons.push('integrity_verification_failed');
  if (conflicts.hasContradictions) reasons.push('unresolved_epistemic_contradictions');
  return {
    promotionEligible: false,
    silentPromotionBlocked: reasons.length > 0,
    authorizesPromotion: false,
    reasons,
  };
}

function exportStandardBundle(dossier) {
  return canonicalValue({
    schema: DEO_DOSSIER_SCHEMA,
    ingestedArtifacts: dossier.ingestedArtifacts,
    rejectedArtifacts: dossier.rejectedArtifacts,
    observations: dossier.observations,
    retention: dossier.retention,
    correlations: dossier.correlations,
    conflicts: dossier.conflicts,
    integrity: dossier.integrity,
    promotionGate: dossier.promotionGate,
  });
}

function runDigitalEvidenceOrgan(corpusInput = {}, options = {}) {
  const artifacts = Array.isArray(corpusInput.artifacts) ? corpusInput.artifacts : [];
  if (artifacts.length === 0) {
    throw deoError('DEO_MISSING_EVIDENCE', 'Digital Evidence Organ requires at least one artifact in corpus.');
  }

  const state = {
    rawVault: new Map(),
    ingestedArtifacts: [],
    rejectedArtifacts: [],
    allObservations: [],
    duplicateCount: 0,
    headProvenanceHash: null,
  };

  for (const entry of artifacts) {
    try {
      ingestSingleArtifactEntry(entry, state, options);
    } catch (err) {
      if (options.failFast === true) throw err;
      recordRejection(entry, err, state);
    }
  }

  const { uniqueObservations, crossDuplicates } = dedupeCrossArtifactObservations(state.allObservations);
  const integrity = verifyEvidenceIntegrity({ rawArtifacts: state.rawVault, observations: uniqueObservations });
  const conflicts = resolveEvidenceConflicts(uniqueObservations, options.conflictPolicy);
  const correlations = correlateObservations(uniqueObservations, options.correlationPolicy);
  const retention = applyEvidenceRetention(uniqueObservations, options.retentionPolicy);

  const dossier = {
    schema: DEO_SCHEMA,
    rawVault: state.rawVault,
    ingestedArtifacts: state.ingestedArtifacts,
    rejectedArtifacts: state.rejectedArtifacts,
    observations: uniqueObservations,
    duplicateCount: state.duplicateCount + crossDuplicates,
    correlations,
    conflicts,
    integrity,
    retention,
    promotionGate: buildPromotionGate(state.rejectedArtifacts, integrity, conflicts),
  };

  const standardExport = exportStandardBundle(dossier);
  const binaryFrame = encodeTypedBinary(standardExport);

  return Object.freeze({
    ...dossier,
    standardExport,
    binaryFrame,
  });
}

module.exports = {
  DEO_SCHEMA,
  DEO_DOSSIER_SCHEMA,
  DEO_OBSERVATION_SCHEMA,
  DEO_BINARY_MAGIC,
  SUPPORTED_FORMATS,
  RETENTION_TIERS,
  KNOWN_EVTX_EVENT_IDS,
  deoError,
  sha256Hex,
  sha256Digest,
  canonicalJson,
  canonicalDigest,
  encodeTypedBinary,
  decodeTypedBinary,
  ingestArtifact,
  normalizeIngestedArtifact,
  computeSourceSignature,
  verifySourceAuthenticity,
  attachProvenance,
  correlateObservations,
  recomputeObservationHash,
  verifyEvidenceIntegrity,
  resolveEvidenceConflicts,
  applyEvidenceRetention,
  pseudonymizeValue,
  exportStandardBundle,
  runDigitalEvidenceOrgan,
};
