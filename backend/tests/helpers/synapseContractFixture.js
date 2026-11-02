'use strict';

const crypto = require('node:crypto');
const { digest } = require('../../src/services/evidenceProtocol/canonical');
const { createMessage } = require('../../src/services/synapseProtocol/contract');

const NOW = '2026-11-02T10:00:00.000Z';
const actor = agentId => ({ agentId, incarnationId: `${agentId}-1`, trustDomain: 'local' });
const state = () => ({ counter: 0, note: 'old' });
const operations = () => [{ kind: 'put', key: 'counter', value: 1 }, { kind: 'remove', key: 'note' }];
const groundingProvenance = { kind: 'synapse-context/v1', strength: 'configured' };

function schemaConfiguration() {
  return { schemaId: 'counter-schema', version: '1', definition: { type: 'object', additionalProperties: false,
    required: ['counter'], properties: { counter: { type: 'integer', minimum: 0 }, note: { type: 'string' } } } };
}

function operationConfigurations() {
  return ['put', 'remove'].map(kind => ({ kind, semanticFingerprint: digest(`synapse.${kind}/v1`),
    canonicalMeaning: `synapse.${kind}/v1`, payloadSchema: { type: 'object', additionalProperties: false,
      required: kind === 'put' ? ['key', 'value'] : ['key'],
      properties: kind === 'put' ? { key: { type: 'string' }, value: {} } : { key: { type: 'string' } } } }));
}

function dictionary() {
  const definitions = operationConfigurations();
  const semanticTable = definitions.map((entry, index) => `${index ? 'R' : 'P'}:${entry.semanticFingerprint}`).sort().join('|');
  const nativeHash = crypto.createHash('sha256').update(`dialect-receiver-sender-counter|3|${semanticTable}`).digest('hex');
  return { dialectId: 'dialect-receiver-sender-counter', participants: ['receiver', 'sender'], domain: 'counter',
    version: 3, baseVocabulary: 'genos-canonical-v3', symbols: Object.fromEntries(definitions.map((entry, index) =>
      [index ? 'R' : 'P', { semanticFingerprint: entry.semanticFingerprint, canonicalMeaning: entry.canonicalMeaning,
        payloadSchema: entry.payloadSchema, confidence: 0.5 }])), commonGroundHash: `sha256:${nativeHash}`,
    status: 'active', expiresAt: null };
}

function context(overrides = {}) {
  const snapshot = dictionary();
  const schema = schemaConfiguration();
  return { contextId: 'context-1', domain: 'counter', publisher: actor('sender'), audience: [actor('receiver')],
    base: { stateDigest: digest(state()), generation: 0 },
    schema: { schemaId: schema.schemaId, version: schema.version, digest: digest(schema.definition) },
    dictionary: { snapshot, digest: digest(snapshot) },
    grounding: operationConfigurations().map(entry => ({ agentA: 'receiver', agentB: 'sender', domain: 'counter',
      semanticFingerprint: entry.semanticFingerprint, status: 'grounded', confidence: 1,
      groundedAt: '2026-11-02 10:00:00', lastConfirmedAt: '2026-11-02 10:00:00', expiresAt: null,
      provenance: { ...groundingProvenance, evidenceRef: 'source-local-contract' } })),
    dependencies: [{ dependencyId: 'workflow', digest: digest('workflow-v1') }], ...overrides };
}

function delta(overrides = {}) {
  return { deltaId: 'delta-1', contextDigest: digest(context()), baseDigest: digest(state()),
    targetDigest: digest({ counter: 1 }), operationsDigest: digest(operations()), ...overrides };
}

function representation(encoding = 'dialect') {
  if (encoding === 'canonical') return { encoding, operations: operations() };
  return { encoding, operations: [{ symbol: 'P', payload: { key: 'counter', value: 1 } }, { symbol: 'R', payload: { key: 'note' } }] };
}

function payload(type) {
  if (type === 'DECLARE_CONTEXT') return { context: context() };
  if (type === 'OFFER_DELTA') return { delta: delta(), representation: representation() };
  const query = { deltaId: 'delta-1', deltaDigest: digest(delta()) };
  if (type === 'REQUEST_MISSING') return { ...query, missing: ['dictionary'], canonicalRequested: true };
  if (type === 'APPLY_DELTA') return { ...query, representation: representation('canonical') };
  if (type === 'ACK_STATE') return { ...query, resultDigest: delta().targetDigest };
  return { ackId: 'ack-1', ...query, dimension: 'decoded',
    subjectDigest: digest({ context: context(), delta: delta(), receiver: context().audience[0] }), evidenceRef: 'decoder-result-1' };
}

function message(type = 'DECLARE_CONTEXT', overrides = {}) {
  const response = ['REQUEST_MISSING', 'ACK_STATE', 'ACK_FACT'].includes(type);
  return createMessage({ messageId: `message-${type.toLowerCase()}`, operationId: 'operation-1', missionId: 'mission-1',
    conversationId: 'conversation-1', type, sender: actor(response ? 'receiver' : 'sender'), audience: actor(response ? 'sender' : 'receiver'),
    scope: { organizationId: 'organization-1', projectId: 'project-1' }, causalRefs: [],
    generations: { incarnation: 1, organization: 1, workspace: 1 }, authority: { authorityId: 'authority-1', generation: 1 },
    idempotencyKey: `key-${type.toLowerCase()}`, createdAt: NOW, expiresAt: '2026-11-02T10:05:00.000Z',
    payload: payload(type), ...overrides }, { now: NOW });
}

module.exports = { NOW, actor, state, operations, groundingProvenance, schemaConfiguration,
  operationConfigurations, dictionary, context, delta, representation, payload, message };
