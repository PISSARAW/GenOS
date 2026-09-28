'use strict';

const crypto = require('node:crypto');
const { getRegistry } = require('./indicatorRegistryService');

const RECEIPT_SCHEMA = 'genos.indicator-receipt/v1';
const STAGES = Object.freeze(['specified', 'implemented', 'causal', 'generalized', 'operational']);
const STATUSES = new Set(['passed', 'failed', 'inconclusive', 'not_run', 'unavailable']);
const STATUS_PRECEDENCE = ['failed', 'inconclusive', 'unavailable', 'not_run', 'passed'];

function reject(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function requireObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    reject('RECEIPT_EVIDENCE_INCOHERENT', `${name} must be an object.`);
  }
  return value;
}

function requireText(value, name, errorCode = 'RECEIPT_EVIDENCE_INCOHERENT') {
  if (typeof value !== 'string' || !value.trim()) reject(errorCode, `${name} must be a non-empty string.`);
  return value.trim();
}

function validateIdentity(receipt, registry) {
  if (receipt.schema !== RECEIPT_SCHEMA) reject('RECEIPT_SCHEMA_UNKNOWN', 'Unknown indicator receipt schema.');
  const profile = registry.profiles.find((entry) => entry.id === receipt.profile);
  if (!profile || profile.availability === 'planned') {
    reject('RECEIPT_PROFILE_MISMATCH', `Profile '${receipt.profile}' cannot be evaluated.`);
  }
  const property = registry.properties.find((entry) => entry.id === receipt.property);
  if (!property) reject('RECEIPT_PROFILE_MISMATCH', `Property '${receipt.property}' is not in the registry.`);
  if (receipt.registryVersion !== registry.schema) {
    reject('RECEIPT_SCHEMA_UNKNOWN', 'Receipt registry version does not match the active registry.');
  }
  return { profile, property };
}

function validateProvenance(receipt) {
  if (!Object.prototype.hasOwnProperty.call(receipt, 'result') || receipt.result === null || receipt.result === undefined) {
    reject('RECEIPT_EVIDENCE_INCOHERENT', 'result is required.');
  }
  const protocol = requireObject(receipt.protocol, 'protocol');
  const provenance = requireObject(receipt.provenance, 'provenance');
  requireText(protocol.id, 'protocol.id');
  requireText(protocol.version, 'protocol.version');
  requireText(provenance.runId, 'provenance.runId');
  requireText(provenance.source, 'provenance.source');
  if (!Array.isArray(receipt.limits)) reject('RECEIPT_EVIDENCE_INCOHERENT', 'limits must be an array.');
  if (receipt.limits.some((limit) => typeof limit !== 'string' || !limit.trim())) {
    reject('RECEIPT_EVIDENCE_INCOHERENT', 'Each limit must be a non-empty string.');
  }
}

function validateArtifacts(artifacts) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    reject('RECEIPT_REF_MISSING', 'At least one inline artifact is required.');
  }
  const verified = new Map();
  for (const artifact of artifacts) {
    requireObject(artifact, 'artifact');
    const ref = requireText(artifact.ref, 'artifact.ref', 'RECEIPT_REF_MISSING');
    const content = requireText(artifact.content, `artifact ${ref} content`, 'RECEIPT_REF_MISSING');
    const digest = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
    if (artifact.sha256 !== digest) reject('RECEIPT_EVIDENCE_INCOHERENT', `Artifact '${ref}' hash mismatch.`);
    if (verified.has(ref)) reject('RECEIPT_EVIDENCE_INCOHERENT', `Duplicate artifact '${ref}'.`);
    verified.set(ref, digest);
  }
  return verified;
}

function normalizeStageEvidence(stages, artifacts) {
  requireObject(stages, 'stages');
  const unknownStages = Object.keys(stages).filter((stage) => !STAGES.includes(stage));
  if (unknownStages.length) reject('RECEIPT_EVIDENCE_INCOHERENT', `Unknown stages: ${unknownStages.join(', ')}.`);
  let priorPassed = true;
  return Object.fromEntries(STAGES.map((stage) => {
    const entry = requireObject(stages[stage], `stages.${stage}`);
    if (!STATUSES.has(entry.status)) reject('RECEIPT_EVIDENCE_INCOHERENT', `Invalid status for stage '${stage}'.`);
    const refs = normalizeEvidenceRefs(entry.evidenceRefs, stage);
    if (refs.some((ref) => !artifacts.has(ref))) {
      reject('RECEIPT_REF_MISSING', `Stage '${stage}' has an unresolved evidence reference.`);
    }
    if (entry.status === 'passed') {
      if (!priorPassed) reject('RECEIPT_EVIDENCE_INCOHERENT', `Stage '${stage}' passed without its prerequisites.`);
      if (!refs.length) {
        reject('RECEIPT_REF_MISSING', `Passed stage '${stage}' has an unresolved evidence reference.`);
      }
    } else {
      priorPassed = false;
    }
    return [stage, { status: entry.status, evidenceRefs: refs }];
  }));
}

function normalizeEvidenceRefs(refs, stage) {
  if (!Array.isArray(refs)) reject('RECEIPT_EVIDENCE_INCOHERENT', `stages.${stage}.evidenceRefs must be an array.`);
  return refs.map((ref) => {
    if (typeof ref !== 'string' || !ref.trim()) {
      reject('RECEIPT_EVIDENCE_INCOHERENT', `Stage '${stage}' evidence references must be non-empty strings.`);
    }
    return ref.trim();
  });
}

function evaluateReceipt(receiptInput) {
  const receipt = requireObject(receiptInput, 'receipt');
  const registry = getRegistry();
  const { profile, property } = validateIdentity(receipt, registry);
  validateProvenance(receipt);
  const artifacts = validateArtifacts(receipt.artifacts);
  const stages = normalizeStageEvidence(receipt.stages, artifacts);
  return {
    schema: 'genos.indicator-evaluation/v1',
    receiptId: receipt.id || null,
    registryVersion: registry.schema,
    profile,
    property: { id: property.id, label: property.label },
    protocol: { id: receipt.protocol.id, version: receipt.protocol.version },
    result: receipt.result,
    stages,
    limits: [...receipt.limits],
    provenance: { ...receipt.provenance },
    artifactDigests: Object.fromEntries(artifacts),
    assessment: 'receipt-consistency-only',
    promotionEligible: false,
  };
}

function groupKey(evaluation) {
  return `${evaluation.profile.id}:${evaluation.property.id}`;
}

function aggregateStage(evaluations, stage) {
  const statuses = evaluations.map((entry) => entry.stages[stage].status);
  return STATUS_PRECEDENCE.find((status) => statuses.includes(status)) || 'not_run';
}

function aggregateProperty(evaluations) {
  const first = evaluations[0];
  return {
    profile: first.profile,
    property: first.property,
    stages: Object.fromEntries(STAGES.map((stage) => [stage, {
      status: aggregateStage(evaluations, stage),
      receiptCount: evaluations.length,
      evidenceRefs: [...new Set(evaluations.flatMap((entry) => entry.stages[stage].evidenceRefs))],
    }])),
    receiptIds: evaluations.map((entry) => entry.receiptId).filter(Boolean),
  };
}

function evaluateReceiptSet(receipts) {
  if (!Array.isArray(receipts) || receipts.length === 0) {
    reject('RECEIPT_EVIDENCE_INCOHERENT', 'At least one receipt is required.');
  }
  const evaluations = receipts.map(evaluateReceipt);
  const uniqueIds = evaluations.map((entry) => entry.receiptId).filter(Boolean);
  if (new Set(uniqueIds).size !== uniqueIds.length) {
    reject('RECEIPT_EVIDENCE_INCOHERENT', 'Receipt IDs must be unique in an evaluation set.');
  }
  const groups = new Map();
  for (const evaluation of evaluations) {
    const key = groupKey(evaluation);
    groups.set(key, [...(groups.get(key) || []), evaluation]);
  }
  return {
    schema: 'genos.indicator-evaluation-set/v1',
    registryVersion: getRegistry().schema,
    receiptCount: evaluations.length,
    properties: [...groups.values()].map(aggregateProperty),
    evaluations,
    assessment: 'conservative-status-aggregation-only',
    promotionEligible: false,
  };
}

module.exports = { RECEIPT_SCHEMA, evaluateReceipt, evaluateReceiptSet };
