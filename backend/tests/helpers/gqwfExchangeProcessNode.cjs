'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');
const { digest } = require('../../src/services/evidenceProtocol/canonical');
const { GqwfExchange } = require('../../src/services/gqwfExchange/exchange');
const { CandidatePromotion } = require('../../src/services/gqwfExchange/promotion');
const fixture = require('./gqwfExchangeProcessFixtures.cjs');
const { verifier } = require('./gqwfExchangeProcessVerifier.cjs');

const [role, directory] = process.argv.slice(2);
const context = new AsyncLocalStorage();
const principal = () => context.getStore()?.principal;
const same = (left, right) => digest(left) === digest(right);
const transferCalls = new Map();
let gapWorld = null;

function validEnvelope(message) {
  const audience = role === 'producer' ? fixture.PRODUCER : fixture.RECEIVER;
  return same(message.sender, fixture.PRODUCER) && same(message.audience, audience) &&
    same(message.scope, fixture.SCOPE) && message.missionId === fixture.MISSION &&
    message.conversationId === fixture.CONVERSATION;
}

async function exchangeAuthorization({ operation, request }) {
  if (operation !== 'APPLY') {
    return same(request.scope, fixture.SCOPE) &&
      (principal() === 'supervisor' || same(principal(), fixture.PRODUCER) || same(principal(), fixture.RECEIVER));
  }
  const permitted = role === 'producer' ? principal() === 'supervisor' : same(principal(), fixture.PRODUCER);
  if (!permitted || !validEnvelope(request)) return false;
  await crashAtGap(request);
  return true;
}

async function crashAtGap(request) {
  const calls = (transferCalls.get(request.messageId) || 0) + 1;
  transferCalls.set(request.messageId, calls);
  if (gapWorld === request.payload.worldId && request.type === 'TRANSFER' && calls === 2) {
    gapWorld = null;
    process.send({ milestone: 'blob-written-before-ack' });
    await new Promise(() => {});
  }
}

function promotionAuthorization({ action, request }) {
  if (['INITIALIZE_HEAD', 'HEAD', 'STATE', 'RECEIPT'].includes(action)) {
    return principal() === 'supervisor' && same(request.scope, fixture.SCOPE);
  }
  return same(principal(), fixture.PRODUCER) && validEnvelope(request);
}

function authorizePromotion(request) {
  return same(principal(), fixture.PRODUCER) && same(request.policy, fixture.POLICY) &&
    request.candidate.headName === 'main' && request.verification.verifierRef === 'counter-increases';
}

const exchange = new GqwfExchange({ dbPath: path.join(directory, 'exchange.sqlite'),
  workspaceRoot: directory, authorize: exchangeAuthorization });
const promotion = role === 'receiver' ? new CandidatePromotion({ db: exchange.db, workspaceId: fixture.WORKSPACE,
  authorize: promotionAuthorization, verifiedWorld: query => exchange.verifiedWorld(query),
  verifyEvidence: verifier(exchange, directory), authorizePromotion,
  assertSafeCas: () => exchange.assertSafeCas(), policy: fixture.POLICY }) : null;

async function seed(id) {
  if (principal() !== 'supervisor') throw new Error('GQWF local seed requires operator authority.');
  const entry = fixture.WORLDS[id];
  for (const [hash, bytes] of entry.blobs) await exchange.cas.put({ hash, size: bytes.length }, bytes);
  const offered = fixture.message('OFFER_WORLD', { world: entry.world }, { local: true });
  await exchange.apply(offered);
  const request = { worldId: entry.world.worldId, worldDigest: digest(entry.world) };
  const needed = fixture.message('NEED_OBJECTS', request, { local: true, causes: [offered.messageId] });
  const result = await exchange.apply(needed);
  if (result.objects.length) throw new Error('GQWF source local seed is incomplete.');
  return exchange.apply(fixture.message('VERIFY_WORLD', request, { local: true, causes: [needed.messageId] }));
}

function evidenceLog() {
  if (principal() !== 'supervisor') throw new Error('Evidence audit requires supervisor authority.');
  return JSON.parse(fs.readFileSync(path.join(directory, 'evidence-log.json'), 'utf8'));
}

async function dispatch(request) {
  if (request.action === 'seed') return seed(request.value);
  if (request.action === 'armGap' && principal() === 'supervisor') { gapWorld = request.value; return true; }
  if (request.action === 'world') return exchange.apply(request.value);
  if (request.action === 'describe') return exchange.describe(request.value);
  if (request.action === 'verified') return exchange.verifiedWorld(request.value);
  if (request.action === 'export') return exchange.exportObjects(request.value);
  const actions = { candidate: () => promotion.apply(request.value),
    initialize: () => promotion.initializeHead(request.value), head: () => promotion.head(request.value),
    state: () => promotion.state(request.value), receipt: () => promotion.receipt(request.value),
    evidence: evidenceLog };
  if (!promotion || !Object.hasOwn(actions, request.action)) throw new Error('Unknown GQWF Exchange demo action.');
  return actions[request.action]();
}

let queue = Promise.resolve();
process.on('message', request => {
  queue = queue.then(() => context.run({ principal: request.principal }, async () => {
    try { process.send({ id: request.id, value: await dispatch(request) }); }
    catch (error) { process.send({ id: request.id, error: error.message }); }
  }));
});
process.on('disconnect', () => { exchange.close(); process.exit(0); });
process.send({ id: 'ready', value: { pid: process.pid } });
