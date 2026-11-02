'use strict';

const path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');
const { digest } = require('../../src/services/evidenceProtocol/canonical');
const { SynapseConversation } = require('../../src/services/synapseProtocol/conversation');
const { createContextCodec } = require('../../src/services/synapseProtocol/contextCodec');
const { AcknowledgementLedger } = require('../../src/services/synapseProtocol/acknowledgements');
const fixture = require('./synapseProcessFixtures.cjs');
const native = require('./synapseProcessNative.cjs');
const { providers } = require('./synapseProcessProofs.cjs');

const [role, directory] = process.argv.slice(2);
const context = new AsyncLocalStorage();
const principal = () => context.getStore()?.principal;
const same = (left, right) => digest(left) === digest(right);
let gapDelta = null;

function scoped(value) {
  const query = value.query || value;
  return same(query.scope, fixture.SCOPE) && query.missionId === fixture.MISSION;
}

function authorize({ operation, request }) {
  if (!scoped(request)) return false;
  if (operation !== 'APPLY') return principal() === 'supervisor';
  if (principal() === 'supervisor') return same(request.sender, fixture.ACTORS[role]);
  return same(principal(), request.sender) && same(request.audience, fixture.ACTORS[role]);
}

function ackAuthorization({ action, request }) {
  if (!scoped(request) || principal() !== 'supervisor') return false;
  if (action !== 'ACK_FACT') return true;
  return same(request.sender, fixture.ACTORS[role]) && same(request.audience, fixture.ACTORS.source);
}

const runtime = new SynapseConversation({ dbPath: path.join(directory, 'conversation.sqlite'),
  actor: fixture.ACTORS[role], incarnationGeneration: 1, authority: fixture.authority(role), authorize,
  localContext: ({ query, state }) => fixture.localInput(query, state),
  codec: db => createContextCodec({ db, schema: fixture.SCHEMA, operations: fixture.OPERATIONS,
    groundingProvenance: fixture.PROVENANCE }) });
const ledger = role === 'source' ? null : new AcknowledgementLedger({ dbPath: path.join(directory, 'acknowledgements.sqlite'),
  authorize: ackAuthorization, ...providers(runtime, role) });

async function wire(message) {
  const result = await runtime.apply(message);
  if (message.type === 'APPLY_DELTA' && message.payload.deltaId === gapDelta) {
    if (result.status !== 'applied') throw new Error('SYNAPSE crash probe requires a durable application.');
    gapDelta = null;
    process.send({ milestone: 'state-committed-before-ack-delivery' });
    await new Promise(() => {});
  }
  return result;
}

async function replace(request) {
  const state = await runtime.state(request.query);
  return runtime.replaceState(request.query, { expectedGeneration: state.generation, value: request.value });
}

async function dispatch(request) {
  if (request.action === 'wire') return wire(request.value);
  if (principal() !== 'supervisor') throw new Error('SYNAPSE demo operator authority required.');
  const actions = {
    initialize: value => runtime.initialize(value.query, { value: fixture.BASE, generation: 0 }),
    plan: value => native.plan(runtime, value), state: value => runtime.state(value),
    status: value => runtime.status(value), receipt: value => runtime.receipt(value),
    subject: value => runtime.subject(value), outbox: value => runtime.outbox(value),
    replace, dictionary: value => native.changeDictionary(runtime, value),
    armGap: value => { gapDelta = value; return true; },
    ack: value => ledger.apply(value), facts: value => ledger.facts(value),
  };
  if (!Object.hasOwn(actions, request.action)) throw new Error('Unknown SYNAPSE demo action.');
  return actions[request.action](request.value);
}

let queue = Promise.resolve();
process.on('message', request => {
  queue = queue.then(() => context.run({ principal: request.principal }, async () => {
    try { process.send({ id: request.id, value: await dispatch(request) }); }
    catch (error) { process.send({ id: request.id, error: error.message, code: error.code }); }
  }));
});
process.on('disconnect', () => { runtime.close(); ledger?.close(); process.exit(0); });
native.bootstrap(runtime, role).then(() => process.send({ id: 'ready', value: { pid: process.pid } }), error => {
  process.send({ id: 'ready', error: error.message }); process.exitCode = 1;
});
