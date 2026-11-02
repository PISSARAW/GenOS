'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dialect = require('../../src/services/communication/dialectService');
const { digest } = require('../../src/services/evidenceProtocol/canonical');
const { SynapseConversation } = require('../../src/services/synapseProtocol/conversation');
const { createContextCodec } = require('../../src/services/synapseProtocol/contextCodec');
const native = require('./synapseContextFixture');
let sequence = 0;

function message(type, payload, options = {}) {
  sequence += 1;
  return native.message(type, { messageId: `conversation-message:${sequence}`, idempotencyKey: `conversation-key:${sequence}`,
    payload, ...options });
}

function documentQuery(conversationId = 'conversation-1') {
  return { scope: { organizationId: 'organization-1', projectId: 'project-1' }, missionId: 'mission-1',
    conversationId, contextId: 'context-1' };
}

async function instance(name, filename, options = {}) {
  let dialectId;
  const runtime = new SynapseConversation({ dbPath: filename, actor: native.actor(name),
    incarnationGeneration: 1, authority: { authorityId: 'authority-1', generation: 1 },
    authorize: async () => true, clock: () => native.NOW,
    codec: db => createContextCodec(native.configuration(db, options.configuration)),
    localContext: async ({ query, state }) => ({ contextId: query.contextId, dialectId,
      domain: 'counter', publisher: native.actor('sender'), audience: [native.actor('receiver')],
      state: state.value, generation: state.generation,
      dependencies: [{ dependencyId: 'workflow', digest: digest('workflow-v1') }] }), ...options });
  const existing = await dialect.findDialect({ db: runtime.db, participants: ['sender', 'receiver'], domain: 'counter' });
  dialectId = existing ? existing.dialectId : await native.install(runtime.db, `${name}-local-contract`);
  return { runtime, dialectId };
}

async function setup(options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-conversation-'));
  const source = await instance('sender', path.join(directory, 'source.db'), options.source);
  const receiver = await instance('receiver', path.join(directory, 'receiver.db'), options.receiver);
  const query = documentQuery();
  await source.runtime.initialize(query, { value: native.state(), generation: 0 });
  await receiver.runtime.initialize(query, { value: native.state(), generation: 0 });
  return { directory, source: source.runtime, receiver: receiver.runtime,
    sourceDialectId: source.dialectId, receiverDialectId: receiver.dialectId, documentQuery: query };
}

async function offer(fixture, options = {}) {
  const query = options.query || fixture.documentQuery;
  fixture.documentQuery = query;
  const state = await fixture.source.state(query);
  const context = await fixture.source.captureContext(query);
  const prepared = fixture.source.codec.createDelta({ deltaId: options.deltaId || 'delta-1', context,
    operations: options.operations || native.operations(), state: state.value });
  Object.assign(fixture, { context, delta: prepared.delta, canonical: prepared.representation,
    representation: await fixture.source.codec.encode({ context, operations: options.operations || native.operations() }) });
  const contextFrame = message('DECLARE_CONTEXT', { context }, { conversationId: query.conversationId });
  await fixture.source.apply(contextFrame); await fixture.receiver.apply(contextFrame);
  const deltaFrame = message('OFFER_DELTA', { delta: fixture.delta, representation: fixture.representation },
    { conversationId: query.conversationId, causalRefs: [contextFrame.messageId] });
  await fixture.source.apply(deltaFrame);
  const offered = await fixture.receiver.apply(deltaFrame);
  Object.assign(fixture, { offerMessage: deltaFrame, declaration: contextFrame, offered,
    deltaQuery: { scope: query.scope, missionId: query.missionId, conversationId: query.conversationId,
      deltaId: fixture.delta.deltaId, deltaDigest: digest(fixture.delta) } });
  if (offered.outbound.length) {
    fixture.requestMessage = offered.outbound[0];
    await fixture.source.apply(fixture.requestMessage);
  }
  return offered;
}

async function apply(fixture, options = {}) {
  const representation = options.encoding === 'canonical' ? fixture.canonical : fixture.representation;
  const cause = fixture.requestMessage || fixture.offerMessage;
  const frame = message('APPLY_DELTA', { deltaId: fixture.delta.deltaId, deltaDigest: digest(fixture.delta), representation },
    { conversationId: fixture.documentQuery.conversationId, causalRefs: [cause.messageId] });
  await fixture.source.apply(frame);
  const result = await fixture.receiver.apply(frame);
  fixture.applyMessage = frame;
  if (result.status === 'missing') {
    fixture.requestMessage = result.outbound[0];
    await fixture.source.apply(fixture.requestMessage);
  }
  return result;
}

async function changeDictionary(fixture) {
  await dialect.defineSymbol({ db: fixture.receiver.db, dialectId: fixture.receiverDialectId, symbol: 'EXTRA',
    semanticFingerprint: digest('extra/v1'), canonicalMeaning: 'extra/v1', payloadSchema: { type: 'object' } });
}

function cleanup(fixture) {
  fixture.source.close(); fixture.receiver.close();
  const directory = path.resolve(fixture.directory);
  if (path.dirname(directory) !== path.resolve(os.tmpdir())) throw new Error('Unsafe SYNAPSE temporary root.');
  fs.rmSync(directory, { recursive: true, force: true });
}

module.exports = { ...native, message, documentQuery, instance, setup, offer, apply, changeDictionary, cleanup };
