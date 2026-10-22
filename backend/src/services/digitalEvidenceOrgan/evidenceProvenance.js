'use strict';

const crypto = require('node:crypto');
const { payloadHash, BOUND_ALGORITHM } = require('../provenanceHash');
const { canonicalValue } = require('../stateFingerprint');
const {
  deoError,
  canonicalJson,
  parseIsoTimestamp,
  requireNonEmptyText,
} = require('./deoContract');

const PROVENANCE_SCHEMA = 'genos.deo-provenance/v1';

function computeSourceSignature(params, secret) {
  const { artifactId, rawHash, collectorId } = params;
  const material = `${artifactId}\0${rawHash}\0${collectorId}`;
  return crypto.createHmac('sha256', secret).update(material).digest('hex');
}

function assertTrustedCollector(collectorId, artifactId, trustPolicy) {
  const list = trustPolicy.trustedCollectors;
  if (Array.isArray(list) && list.length > 0 && !list.includes(collectorId)) {
    throw deoError(
      'DEO_FORGED_SOURCE',
      `Collector '${collectorId}' is not in the trusted collectors registry.`,
      { collectorId, artifactId },
    );
  }
}

function assertValidCollectorSignature(ingestedArtifact, collectorId, trustPolicy) {
  const secrets = trustPolicy.collectorSecrets;
  if (!secrets || typeof secrets !== 'object') return;
  const secret = secrets[collectorId];
  if (!secret) {
    throw deoError('DEO_FORGED_SOURCE', `No signing key registered for collector '${collectorId}'.`);
  }
  const meta = ingestedArtifact.sourceMetadata ?? {};
  const providedSig = String(meta.signature ?? '').trim().toLowerCase();
  const expectedSig = computeSourceSignature({
    artifactId: ingestedArtifact.artifactId,
    rawHash: ingestedArtifact.rawHash,
    collectorId,
  }, secret);
  const validHex = /^[a-f0-9]{64}$/.test(providedSig);
  const matches = validHex && crypto.timingSafeEqual(Buffer.from(providedSig, 'hex'), Buffer.from(expectedSig, 'hex'));
  if (!matches) {
    throw deoError(
      'DEO_FORGED_SOURCE',
      `Forged or invalid collector signature for artifact '${ingestedArtifact.artifactId}'.`,
    );
  }
}

function verifySourceAuthenticity(ingestedArtifact, trustPolicy = {}) {
  const meta = ingestedArtifact.sourceMetadata ?? {};
  const collectorId = requireNonEmptyText(meta.collectorId, 'DEO_FORGED_SOURCE', 256);
  const sourceUri = requireNonEmptyText(meta.sourceUri, 'DEO_FORGED_SOURCE', 1024);

  assertTrustedCollector(collectorId, ingestedArtifact.artifactId, trustPolicy);
  assertValidCollectorSignature(ingestedArtifact, collectorId, trustPolicy);

  if (meta.claimedSource && meta.claimedSource !== collectorId) {
    throw deoError(
      'DEO_FORGED_SOURCE',
      `Source spoofing detected: claimedSource '${meta.claimedSource}' != authenticated collector '${collectorId}'.`,
    );
  }

  return { collectorId, sourceUri };
}

function buildContext(meta, options) {
  return canonicalValue({
    organizationId: meta.organizationId ?? options.organizationId ?? 'org-default',
    projectId: meta.projectId ?? options.projectId ?? 'proj-default',
    environment: meta.environment ?? 'production',
    missionId: meta.missionId ?? null,
  });
}

function createObservationProvenanceRecord(obs, metaInfo, parentHash) {
  const provPayload = canonicalValue({
    schema: PROVENANCE_SCHEMA,
    observationId: obs.observationId,
    observationHash: obs.observationHash,
    artifactId: metaInfo.artifactId,
    rawArtifactHash: metaInfo.rawHash,
    sourceFormat: metaInfo.format,
    sourceUri: metaInfo.sourceUri,
    collectorId: metaInfo.collectorId,
    occurredAt: obs.occurredAt,
    collectedAt: metaInfo.collectedAt,
    context: metaInfo.context,
  });
  const currentHash = payloadHash(canonicalJson(provPayload), parentHash);
  return Object.freeze({
    id: `prov:${currentHash.slice(0, 16)}`,
    algorithm: BOUND_ALGORITHM,
    payloadHash: currentHash,
    parentHash,
    payload: provPayload,
  });
}

function attachProvenance(ingestedArtifact, normalizedBatch, options = {}) {
  const validInput = Boolean(ingestedArtifact && normalizedBatch && Array.isArray(normalizedBatch.observations));
  if (!validInput) {
    throw deoError('DEO_MISSING_EVIDENCE', 'Provenance attachment requires both ingested artifact and normalized observations.');
  }
  const { collectorId, sourceUri } = verifySourceAuthenticity(ingestedArtifact, options.trustPolicy);
  const meta = ingestedArtifact.sourceMetadata ?? {};
  const collectedAt = parseIsoTimestamp(
    meta.collectedAt ?? new Date().toISOString(),
    'DEO_PROVENANCE_TIMESTAMP_INVALID',
  ).iso;
  const metaInfo = {
    artifactId: ingestedArtifact.artifactId,
    rawHash: ingestedArtifact.rawHash,
    format: ingestedArtifact.format,
    collectorId,
    sourceUri,
    collectedAt,
    context: buildContext(meta, options),
  };

  let parentHash = options.parentHash ?? null;
  const records = [];
  const observationsWithProvenance = normalizedBatch.observations.map((obs) => {
    const provRecord = createObservationProvenanceRecord(obs, metaInfo, parentHash);
    records.push(provRecord);
    parentHash = provRecord.payloadHash;
    return Object.freeze({ ...obs, provenance: provRecord });
  });

  return Object.freeze({
    artifactId: ingestedArtifact.artifactId,
    collectorId,
    sourceUri,
    observations: observationsWithProvenance,
    provenanceRecords: records,
    headProvenanceHash: parentHash,
  });
}

module.exports = {
  PROVENANCE_SCHEMA,
  computeSourceSignature,
  verifySourceAuthenticity,
  attachProvenance,
};
