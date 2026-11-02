'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const nativeManifest = require('../../src/services/gqwf/manifest');
const closure = require('../../src/services/gqwf/executionClosure');
const metadata = require('../../src/services/gqwf/metadataStore');
const objects = require('../../src/services/gqwf/objects');
const { digest } = require('../../src/services/evidenceProtocol/canonical');
const { GqwfExchange } = require('../../src/services/gqwfExchange/exchange');
const contract = require('./gqwfExchangeContractFixture');
let sequence = 0;

function world() {
  const content = new Map([['counter.json', Buffer.from('{"counter":1}\n')], ['README.md', Buffer.from('Isolated candidate\n')]]);
  const built = nativeManifest.createManifest([...content].map(([name, bytes]) =>
    ({ path: name, hash: objects.sha256(bytes), size: bytes.length, mode: 0o600 })));
  const source = contract.world();
  const execution = closure.buildManifest({ ...source.closure, rootHash: built.hash });
  const closureSerialized = JSON.stringify(execution);
  return { descriptor: { ...source, rootHash: built.hash, manifest: built.manifest, manifestSerialized: built.serialized,
    closure: execution, closureSerialized, closureHash: metadata.digest(closureSerialized) },
  content: new Map([...content.values()].map((bytes) => [objects.sha256(bytes), bytes])) };
}

function message(value, type = 'OFFER_WORLD', overrides = {}) {
  sequence += 1;
  const payload = type === 'OFFER_WORLD' ? { world: value } : { worldId: value.worldId, worldDigest: digest(value) };
  return contract.message(type, { messageId: `transfer-message:${sequence}`, idempotencyKey: `transfer-key:${sequence}`,
    payload, ...overrides });
}

function query(value) {
  const envelope = message(value);
  return { scope: envelope.scope, missionId: envelope.missionId, conversationId: envelope.conversationId,
    worldId: value.worldId, worldDigest: digest(value) };
}

function instance(root, options = {}) {
  return new GqwfExchange({ workspaceRoot: root, dbPath: path.join(root, 'exchange.db'),
    authorize: async () => true, clock: () => contract.NOW, ...options });
}

async function next(exchange, type, options) {
  const state = exchange.store.state(options.query);
  const payload = { worldId: state.world.worldId, worldDigest: state.query.worldDigest, ...options.payload };
  return message(state.world, type, { causalRefs: [state.lastMessageId], payload, ...options.overrides });
}

async function setup() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gqwf-exchange-transfer-'));
  const sourceRoot = path.join(directory, 'source');
  const targetRoot = path.join(directory, 'receiver');
  fs.mkdirSync(sourceRoot); fs.mkdirSync(targetRoot);
  const source = instance(sourceRoot);
  const receiver = instance(targetRoot);
  const value = world();
  const binding = query(value.descriptor);
  for (const [hash, bytes] of value.content) await source.cas.put({ hash, size: bytes.length }, bytes);
  await source.apply(message(value.descriptor));
  await source.apply(await next(source, 'NEED_OBJECTS', { query: binding }));
  await source.apply(await next(source, 'VERIFY_WORLD', { query: binding }));
  return { directory, sourceRoot, targetRoot, source, receiver, world: value.descriptor, content: value.content, query: binding };
}

async function transferAll(setup) {
  await setup.receiver.apply(message(setup.world));
  const needed = await setup.receiver.apply(await next(setup.receiver, 'NEED_OBJECTS', { query: setup.query }));
  const exported = await setup.source.exportObjects({ ...setup.query, hashes: needed.objects.map((blob) => blob.hash) });
  for (const blob of exported) await setup.receiver.apply(await next(setup.receiver, 'TRANSFER',
    { query: setup.query, payload: { hash: blob.hash, bytesBase64: blob.bytesBase64 } }));
  return needed;
}

function cleanup(setup) {
  setup.source.close(); setup.receiver.close(); fs.rmSync(setup.directory, { recursive: true, force: true });
}

module.exports = { ...contract, world, message, query, instance, next, setup, transferAll, cleanup };
