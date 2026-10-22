'use strict';

const { payloadHash } = require('../provenanceHash');
const { canonicalValue } = require('../stateFingerprint');
const {
  DEO_OBSERVATION_SCHEMA,
  deoError,
  sha256Digest,
  canonicalJson,
  canonicalDigest,
  freezeRawBytes,
} = require('./deoContract');

function recomputeObservationHash(obs) {
  const body = canonicalValue({
    schema: obs.schema ?? DEO_OBSERVATION_SCHEMA,
    sourceFormat: obs.sourceFormat,
    observationType: obs.observationType,
    category: obs.category,
    severity: obs.severity,
    occurredAt: obs.occurredAt,
    epochMs: obs.epochMs,
    subject: obs.subject,
    attributes: obs.attributes,
    epistemicType: obs.epistemicType,
    promotionEligible: obs.promotionEligible,
  });
  return canonicalDigest(body);
}

function lookupRawEntry(rawArtifactStore, artifactId) {
  if (!rawArtifactStore) return null;
  if (typeof rawArtifactStore.get === 'function') return rawArtifactStore.get(artifactId);
  return rawArtifactStore[artifactId] ?? null;
}

function verifyRawArtifacts(rawArtifactStore, observations) {
  const violations = [];
  const referencedArtifacts = new Set(observations.map((o) => o.artifactId));

  for (const artifactId of referencedArtifacts) {
    const rawEntry = lookupRawEntry(rawArtifactStore, artifactId);
    if (!rawEntry || !rawEntry.rawBytes) {
      violations.push({
        code: 'DEO_MISSING_EVIDENCE',
        artifactId,
        reason: `Referenced raw artifact '${artifactId}' is missing from the raw vault.`,
      });
    } else {
      const recomputedRawHash = sha256Digest(freezeRawBytes(rawEntry.rawBytes));
      if (recomputedRawHash !== rawEntry.rawHash) {
        violations.push({
          code: 'DEO_RAW_ARTIFACT_TAMPERED',
          artifactId,
          expected: rawEntry.rawHash,
          actual: recomputedRawHash,
          reason: `Raw bytes of '${artifactId}' do not match sealed hash.`,
        });
      }
    }
  }
  return violations;
}

function checkProvenanceReceipt(obs, rawArtifactStore) {
  const prov = obs.provenance;
  const hasProv = Boolean(prov && prov.payload && prov.payloadHash);
  if (!hasProv) {
    return [{
      code: 'DEO_MISSING_EVIDENCE',
      observationId: obs.observationId,
      reason: `Observation '${obs.observationId}' is missing its provenance receipt.`,
    }];
  }
  const violations = [];
  const expectedProvHash = payloadHash(canonicalJson(prov.payload), prov.parentHash ?? null);
  if (expectedProvHash !== prov.payloadHash) {
    violations.push({
      code: 'DEO_PROVENANCE_TAMPERED',
      observationId: obs.observationId,
      expected: prov.payloadHash,
      actual: expectedProvHash,
      reason: `Provenance receipt '${prov.id}' Merkle hash mismatch.`,
    });
  }
  if (prov.payload.observationHash !== obs.observationHash) {
    violations.push({
      code: 'DEO_PROVENANCE_UNBOUND',
      observationId: obs.observationId,
      reason: `Provenance receipt does not bind to observationHash '${obs.observationHash}'.`,
    });
  }
  const rawEntry = lookupRawEntry(rawArtifactStore, obs.artifactId);
  if (rawEntry && prov.payload.rawArtifactHash !== rawEntry.rawHash) {
    violations.push({
      code: 'DEO_RAW_PROVENANCE_MISMATCH',
      observationId: obs.observationId,
      artifactId: obs.artifactId,
      reason: 'Provenance rawArtifactHash disagrees with vault rawHash.',
    });
  }
  return violations;
}

function verifyObservationAndProvenance(obs, rawArtifactStore) {
  const violations = [];
  const expectedObsHash = recomputeObservationHash(obs);
  if (expectedObsHash !== obs.observationHash) {
    violations.push({
      code: 'DEO_OBSERVATION_TAMPERED',
      observationId: obs.observationId,
      expected: obs.observationHash,
      actual: expectedObsHash,
      reason: `Observation '${obs.observationId}' payload was altered after normalization.`,
    });
  }
  return violations.concat(checkProvenanceReceipt(obs, rawArtifactStore));
}

function verifyEvidenceIntegrity(bundle = {}) {
  const observations = Array.isArray(bundle.observations) ? bundle.observations : [];
  if (observations.length === 0) {
    return Object.freeze({
      intact: false,
      promotionGateClosed: true,
      violations: [{
        code: 'DEO_MISSING_EVIDENCE',
        reason: 'Cannot verify an empty observation set.',
      }],
    });
  }
  const violations = [
    ...verifyRawArtifacts(bundle.rawArtifacts, observations),
    ...observations.flatMap((obs) => verifyObservationAndProvenance(obs, bundle.rawArtifacts)),
  ];

  if (bundle.strict === true && violations.length > 0) {
    throw deoError(violations[0].code, violations[0].reason, { violations });
  }

  return Object.freeze({
    intact: violations.length === 0,
    checkedObservations: observations.length,
    promotionGateClosed: violations.length > 0,
    violations,
  });
}

module.exports = {
  recomputeObservationHash,
  verifyEvidenceIntegrity,
};
