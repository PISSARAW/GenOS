'use strict';

const schemaService = require('../../../syncytiumSchemaService');
const { randomUUID } = require('node:crypto');

const CLAIM_TYPES = new Set(['factual', 'normative', 'preference', 'belief']);
const EVIDENCE_KINDS = new Set(['observation', 'test_result', 'replay', 'approval', 'log', 'artifact', 'reconstruction']);

function createEpistemicVariantService(syncytium) {
  return {
    createEpistemicSession: (mission, options) => syncytium.createSession(mission, { ...options, schema: schema() }),
    addEpistemicClaim: (sessionId, request) => addEntry({ sessionId, request, field: 'claims', syncytium }),
    addEpistemicEvidence: (sessionId, request) => addEvidence({ sessionId, request, field: 'evidence', syncytium }),
    addEpistemicRefutation: (sessionId, request) => addEvidence({ sessionId, request, field: 'refutations', syncytium }),
    recordEpistemicUncertainty: (sessionId, request) => addUncertainty(sessionId, request, syncytium),
    verifyEpistemicClaim: (sessionId, request) => addVerification({ sessionId, request, syncytium }),
    updateEpistemicConfidence: (sessionId, request) => addConfidenceUpdate({ sessionId, request, syncytium }),
    epistemicSnapshot: (sessionId, options) => buildSnapshot(sessionId, options, syncytium)
  };
}

function schema() {
  const appendOnly = { dataType: 'ADD_WINS_SET', consistencyZone: 'APPEND_ONLY' };
  return schemaService.compile({ schemaId: 'syncytium-epistemic-v1', fields: {
    claims: appendOnly, evidence: appendOnly, refutations: appendOnly, uncertainty: appendOnly,
    verification: appendOnly, confidence_updates: appendOnly
  } });
}

async function addEntry(context) {
  const { sessionId, request = {}, field, syncytium } = context;
  validateClaimInput(request);
  const snapshot = await syncytium.snapshot(sessionId, request.options || {});
  const claims = snapshot.shared.sharedFields.claims || [];
  const relations = validateClaimRelations(request, claims);
  const now = Date.now();
  const validity = claimValidity(request, now);
  return add({ sessionId, request, field, value: {
    claimId: request.claimId, statement: request.statement, claimType: request.claimType,
    authorId: request.actorId, confidence: confidence(request.confidence),
    ...validity, contradicts: relations,
    provenance: provenance(request.provenance, request.actorId, now)
  }, syncytium });
}

function validateClaimInput(request) {
  if (!request.claimId || !request.statement || !CLAIM_TYPES.has(request.claimType)) throw inputError('A claim requires claimId, statement and a recognized claimType.');
}

function validateClaimRelations(request, claims) {
  if (claims.some((claim) => claim.claimId === request.claimId)) throw inputError('Claim identifiers are immutable.');
  const relations = stringList(request.contradicts);
  if (relations.includes(request.claimId) || relations.some((id) => !claims.some((claim) => claim.claimId === id))) throw inputError('Contradictions must reference existing, distinct claim identifiers.');
  return relations;
}

function claimValidity(request, now) {
  const validFrom = timestamp(request.validFrom, now);
  const validUntil = timestamp(request.validUntil, null);
  if (validUntil !== null && validUntil <= validFrom) throw inputError('Claim validUntil must be later than validFrom.');
  return { validFrom, validUntil };
}

function confidence(value) {
  if (value === undefined) return 0.5;
  if (!Number.isFinite(value) || value < 0 || value > 1) throw inputError('Claim confidence must be between 0 and 1.');
  return value;
}

function timestamp(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (!Number.isSafeInteger(value) || value < 0) throw inputError('Claim validity timestamps must be non-negative integers.');
  return value;
}

function stringList(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw inputError('Claim contradictions must be a list of claim identifiers.');
  }
  return [...new Set(value)];
}

function provenance(input, actorId, createdAt) {
  if (input !== undefined && (!input || typeof input !== 'object' || Array.isArray(input))) {
    throw inputError('Claim provenance must be an object.');
  }
  return { ...(input || {}), actorId, sourceId: input?.sourceId || actorId, recordedAt: createdAt };
}

async function addEvidence(context) {
  const { sessionId, request = {}, field, syncytium } = context;
  if (!request.claimId || !request.evidenceId || !EVIDENCE_KINDS.has(request.kind) || !hasPayload(request.payload)) {
    throw inputError('Evidence and refutations require claimId, evidenceId, a recognized kind and a typed payload.');
  }
  return add({ sessionId, request, field, value: {
    claimId: request.claimId, evidenceId: request.evidenceId,
    kind: request.kind, payload: request.payload, authorId: request.actorId,
    sourceId: request.provenance?.sourceId || request.actorId,
    provenance: request.provenance || null
  }, syncytium });
}

async function addUncertainty(sessionId, request = {}, syncytium) {
  if (!request.claimId || !Number.isFinite(request.estimate) || request.estimate < 0 || request.estimate > 1) {
    throw inputError('Uncertainty requires a claimId and an estimate between 0 and 1.');
  }
  return add({ sessionId, request, field: 'uncertainty', value: {
    claimId: request.claimId, estimate: request.estimate,
    method: request.method || 'unspecified', authorId: request.actorId
  }, syncytium });
}

async function addVerification(context) {
  const { sessionId, request = {}, syncytium } = context;
  validateVerificationInput(request);
  const snapshot = await syncytium.snapshot(sessionId, request.options || {});
  const claims = snapshot.shared.sharedFields.claims || [];
  const claim = requireIndependentVerifier(snapshot.shared.sharedFields, request, claims);
  return add({ sessionId, request, field: 'verification', value: {
    claimId: request.claimId, verificationId: request.verificationId, actorId: request.actorId,
    sourceId: request.sourceId, outcome: request.outcome || 'verified', provenance: provenance(request.provenance, request.actorId, Date.now())
  }, syncytium });
}

function validateVerificationInput(request) {
  if (!request.claimId || !request.verificationId || !request.actorId || !request.sourceId
    || !['verified', 'refuted', 'inconclusive'].includes(request.outcome || 'verified')) throw inputError('Verification requires claimId, verificationId, actorId and sourceId.');
}

function requireIndependentVerifier(fields, request, claims) {
  const claim = claims.find((item) => item.claimId === request.claimId);
  if (!claim) throw inputError('Verification references an unknown claim.');
  const reusedSource = isSourceUsed(fields, request.claimId, request.sourceId);
  const reusedVerifier = isVerifierUsed(fields.verification, request.claimId, request.actorId);
  if (request.actorId === claim.authorId || reusedSource || reusedVerifier) throw inputError('Independent verification requires a new actor and source.');
  return claim;
}

async function addConfidenceUpdate(context) {
  const { sessionId, request = {}, syncytium } = context;
  validateConfidenceUpdateInput(request);
  const confidenceValue = confidence(request.confidence);
  const snapshot = await syncytium.snapshot(sessionId, request.options || {});
  const claim = (snapshot.shared.sharedFields.claims || []).find((item) => item.claimId === request.claimId);
  if (!claim) throw inputError('Confidence update references an unknown claim.');
  validateIndependentConfidenceSource(snapshot.shared.sharedFields, claim, request);
  return add({ sessionId, request, field: 'confidence_updates', value: {
    claimId: request.claimId, updateId: request.updateId, confidence: confidenceValue,
    actorId: request.actorId, sourceId: request.sourceId, reason: request.reason || null,
    provenance: provenance(request.provenance, request.actorId, Date.now())
  }, syncytium });
}

function validateConfidenceUpdateInput(request) {
  if (!request.claimId || !request.updateId || !request.actorId || !request.sourceId) throw inputError('Confidence updates require claimId, updateId, actorId and sourceId.');
}

function validateIndependentConfidenceSource(fields, claim, request) {
  if (request.actorId === claim.authorId || isSourceUsed(fields, request.claimId, request.sourceId)) throw inputError('Confidence updates require an independent actor and source.');
}

function isSourceUsed(fields, claimId, sourceId) {
  const related = [...(fields.evidence || []), ...(fields.refutations || []), ...(fields.verification || []), ...(fields.confidence_updates || [])];
  return related.some((item) => item.claimId === claimId && (item.sourceId || item.provenance?.sourceId) === sourceId)
    || (fields.claims || []).some((claim) => claim.claimId === claimId && claim.provenance?.sourceId === sourceId);
}

function isVerifierUsed(items = [], claimId, actorId) {
  return items.some((item) => item.claimId === claimId && item.actorId === actorId);
}

async function add(context) {
  const { sessionId, request, field, value, syncytium } = context;
  if (!request.actorId) throw inputError('Epistemic entries require an actorId.');
  return syncytium.applyOperation(sessionId, {
    opId: request.opId || randomUUID(), actorId: request.actorId,
    kind: { type: 'typed_field', key: field, action: 'add', value }
  }, request.options || {});
}

function hasPayload(payload) {
  return payload !== undefined && payload !== null && typeof payload === 'object' && !Array.isArray(payload)
    && Object.keys(payload).length > 0;
}

async function buildSnapshot(sessionId, options, syncytium) {
  const result = await syncytium.snapshot(sessionId, options || {});
  const fields = result.shared.sharedFields;
  return { ...result, epistemic: epistemicProjection(fields, options) };
}

function epistemicProjection(fields, options) {
  const claims = fields.claims || [];
  const at = Number.isSafeInteger(options?.at) ? options.at : Date.now();
  return { claims, evidence: fields.evidence || [], refutations: fields.refutations || [], uncertainty: fields.uncertainty || [],
    verification: fields.verification || [], confidenceUpdates: fields.confidence_updates || [],
    confidenceByClaim: resolveConfidence(claims, fields.confidence_updates || []), contradictions: contradictionEdges(claims),
    effectiveClaims: claims.filter((claim) => isEffectiveAt(claim, at)) };
}

function contradictionEdges(claims) {
  return claims.flatMap((claim) => (claim.contradicts || []).map((claimId) => ({ from: claim.claimId, to: claimId })));
}

function isEffectiveAt(claim, at) {
  return (claim.validFrom ?? 0) <= at && (claim.validUntil === null || claim.validUntil === undefined || claim.validUntil > at);
}

function resolveConfidence(claims, updates) {
  return Object.fromEntries(claims.map((claim) => {
    const latest = updates.filter((item) => item.claimId === claim.claimId)
      .sort((left, right) => left.provenance.recordedAt - right.provenance.recordedAt || left.updateId.localeCompare(right.updateId)).at(-1);
    return [claim.claimId, latest?.confidence ?? claim.confidence ?? 0.5];
  }));
}

function inputError(message) {
  return Object.assign(new Error(message), { code: 'SYNCYTIUM_EPISTEMIC_ENTRY_INVALID' });
}

module.exports = { createEpistemicVariantService };
