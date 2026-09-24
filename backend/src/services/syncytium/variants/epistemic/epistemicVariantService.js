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
    epistemicSnapshot: (sessionId, options) => buildSnapshot(sessionId, options, syncytium)
  };
}

function schema() {
  const appendOnly = { dataType: 'ADD_WINS_SET', consistencyZone: 'APPEND_ONLY' };
  return schemaService.compile({ schemaId: 'syncytium-epistemic-v1', fields: {
    claims: appendOnly, evidence: appendOnly, refutations: appendOnly, uncertainty: appendOnly
  } });
}

async function addEntry(context) {
  const { sessionId, request = {}, field, syncytium } = context;
  if (!request.claimId || !request.statement || !CLAIM_TYPES.has(request.claimType)) {
    throw inputError('A claim requires claimId, statement and a recognized claimType.');
  }
  return add({ sessionId, request, field, value: {
    claimId: request.claimId, statement: request.statement, claimType: request.claimType,
    authorId: request.actorId, provenance: request.provenance || null
  }, syncytium });
}

async function addEvidence(context) {
  const { sessionId, request = {}, field, syncytium } = context;
  if (!request.claimId || !request.evidenceId || !EVIDENCE_KINDS.has(request.kind) || !hasPayload(request.payload)) {
    throw inputError('Evidence and refutations require claimId, evidenceId, a recognized kind and a typed payload.');
  }
  return add({ sessionId, request, field, value: {
    claimId: request.claimId, evidenceId: request.evidenceId,
    kind: request.kind, payload: request.payload, authorId: request.actorId,
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
  return { ...result, epistemic: {
    claims: fields.claims || [], evidence: fields.evidence || [],
    refutations: fields.refutations || [], uncertainty: fields.uncertainty || []
  } };
}

function inputError(message) {
  return Object.assign(new Error(message), { code: 'SYNCYTIUM_EPISTEMIC_ENTRY_INVALID' });
}

module.exports = { createEpistemicVariantService };
