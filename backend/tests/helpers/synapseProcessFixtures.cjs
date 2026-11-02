'use strict';

const { digest } = require('../../src/services/evidenceProtocol/canonical');
const { createMessage } = require('../../src/services/synapseProtocol/contract');

const actor = agentId => ({ agentId, incarnationId: `${agentId}:1`, trustDomain: 'synapse-demo' });
const ACTORS = Object.fromEntries(['source', 'receiver-a', 'receiver-b'].map(id => [id, actor(id)]));
const SCOPE = { organizationId: 'synapse-demo', projectId: 'shared-meaning' };
const MISSION = 'synapse-mission';
const PROVENANCE = { kind: 'synapse-context/v1', strength: 'configured' };
const STATUS = { type: 'object', required: ['status'], additionalProperties: false,
  properties: { status: { enum: ['valid', 'accepted', 'ready', 'retracted', 'suspended', 'reevaluate', 'reevaluated'] } } };
const SCHEMA = { schemaId: 'epistemic-state', version: '1', definition: { type: 'object',
  required: ['P17', 'C42', 'D8'], additionalProperties: false,
  properties: { P17: STATUS, C42: STATUS, D8: STATUS, localNote: { type: 'string' } } } };
const PAYLOAD = { type: 'object', required: ['key', 'value'], additionalProperties: false,
  properties: { key: { type: 'string' }, value: {} } };
const OPERATIONS = [{ kind: 'put', semanticFingerprint: digest('synapse.put/v1'),
  canonicalMeaning: 'synapse.put/v1', payloadSchema: PAYLOAD },
{ kind: 'remove', semanticFingerprint: digest('synapse.remove/v1'), canonicalMeaning: 'synapse.remove/v1',
  payloadSchema: { type: 'object', required: ['key'], additionalProperties: false, properties: { key: { type: 'string' } } } }];
const BASE = { P17: { status: 'valid' }, C42: { status: 'accepted' }, D8: { status: 'ready' } };
const CHANGES = [ { kind: 'put', key: 'P17', value: { status: 'retracted' } },
  { kind: 'put', key: 'C42', value: { status: 'suspended' } }, { kind: 'put', key: 'D8', value: { status: 'reevaluate' } } ];
const REVIEW = [{ kind: 'put', key: 'D8', value: { status: 'reevaluated' } }];
let sequence = 0;

function query(receiver, conversation = 'initial') {
  return { scope: SCOPE, missionId: MISSION, conversationId: `${receiver}:${conversation}`, contextId: `epistemic:${receiver}` };
}

function receiverOf(query) {
  const id = query.contextId.slice('epistemic:'.length);
  if (!['receiver-a', 'receiver-b'].includes(id)) throw new Error('Unknown SYNAPSE demo receiver.');
  return id;
}

const authority = id => ({ authorityId: `${id}:local-grant`, generation: 1 });

function localInput(query, state) {
  const receiver = receiverOf(query);
  return { contextId: query.contextId, dialectId: `dialect-${receiver}-source-epistemic`, domain: 'epistemic',
    publisher: ACTORS.source, audience: [ACTORS[receiver]], state: state.value, generation: state.generation,
    dependencies: [{ dependencyId: 'P17-provenance', digest: digest({ proof: 'P17', revision: 1 }) }] };
}

function changed(value, operations) {
  const result = structuredClone(value);
  for (const operation of operations) {
    if (operation.kind === 'put') result[operation.key] = operation.value;
    else delete result[operation.key];
  }
  return result;
}

function message(type, payload, options) {
  const sender = options.sender || 'source';
  const audience = sender === 'source' ? options.receiver : 'source';
  return createMessage({ messageId: `demo:${++sequence}:${type}`, operationId: `op:${options.query.conversationId}`,
    missionId: MISSION, conversationId: options.query.conversationId, type,
    sender: ACTORS[sender], audience: ACTORS[audience], scope: SCOPE, causalRefs: options.causes || [],
    generations: { incarnation: 1, organization: 1, workspace: 1 }, authority: authority(sender),
    idempotencyKey: `demo:${sequence}:${type}`, createdAt: '2026-11-02T00:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z', payload });
}

module.exports = { ACTORS, SCOPE, MISSION, PROVENANCE, SCHEMA, OPERATIONS, BASE, CHANGES, REVIEW,
  query, receiverOf, authority, localInput, changed, message };
