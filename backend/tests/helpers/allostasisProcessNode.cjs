'use strict';

const path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');
const { digest } = require('../../src/services/evidenceProtocol/canonical');
const { AllostasisAllocator } = require('../../src/services/allostasisProtocol/allocator');
const { AllostasisUsage } = require('../../src/services/allostasisProtocol/usage');
const { ObservationRegistry } = require('../../src/services/allostasisProtocol/observations');
const { aggregateMetabolicUsage } = require('../../src/services/metabolicLedgerService');
const fixture = require('./allostasisProcessFixtures.cjs');
const source = require('./allostasisProcessSources.cjs');
const { ClientJournal } = require('./allostasisProcessJournal.cjs');
const { MeasuredProvider } = require('./allostasisProcessProvider.cjs');

const [role, directory, providerDirectory] = process.argv.slice(2);
const context = new AsyncLocalStorage();
const principal = () => context.getStore()?.principal;
const same = (a, b) => a !== undefined && b !== undefined && digest(a) === digest(b);
let nativeSources;
const sourceQueries = new Map();
let sourceSequence = 0;

function readSource(value) {
  const id = ++sourceSequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      sourceQueries.delete(id);
      reject(Object.assign(new Error('Source observation timeout.'), { code: 'SOURCE_UNAVAILABLE' }));
    }, 20000);
    sourceQueries.set(id, { resolve, reject, timer });
    process.send({ sourceQuery: id, value });
  });
}

function sourceReply(response) {
  const pending = sourceQueries.get(response.sourceReply);
  if (!pending) return;
  sourceQueries.delete(response.sourceReply); clearTimeout(pending.timer);
  if (response.error) pending.reject(Object.assign(new Error(response.error), { code: response.code }));
  else pending.resolve(response.value);
}

function authorization({ operation, request }) {
  const query = request.query || request;
  if (!same(query.scope, fixture.SCOPE) || query.missionId !== fixture.MISSION) return false;
  if (principal() === 'supervisor') return true;
  if (operation === 'FORECAST') {
    return ['client-a', 'client-b'].some(client => same(principal(), fixture.ACTORS[client]) &&
      query.conversationId === `${client}:initial`);
  }
  if (operation === 'EXPOSE') return ['client-a', 'client-b'].some(client => same(principal(), fixture.ACTORS[client]));
  return same(principal(), request.sender) && same(request.audience, fixture.ACTORS.regulator);
}

const resources = {};

function regulator() {
  resources.allocator = new AllostasisAllocator({ dbPath: path.join(directory, 'allocator.sqlite'),
    actor: fixture.ACTORS.regulator, incarnationGeneration: 1, authority: fixture.authority('regulator'),
    authorize: authorization, verifyRequest: source.budgetProof,
    observations: db => {
      nativeSources = source.qualifiers(db);
      return new ObservationRegistry({ db, authorize: authorization,
        qualifyReport: source.sourceGetter(nativeSources, 'report'),
        qualifyForecast: source.sourceGetter(nativeSources, 'forecast') });
    } });
  resources.reader = source.usageReader(readSource);
  resources.usage = new AllostasisUsage({ allocator: resources.allocator,
    authorize: authorization, verifyUsage: resources.reader.verifyUsage });
  return source.bootstrap(resources.allocator, nativeSources).then(() => resources.usage.ready);
}

async function handleRegulator(request) {
  const { allocator, usage } = resources;
  if (request.action === 'reconcile') return usage.reconcile(request.value);
  if (request.action === 'wire') {
    return ['REPORT_USAGE', 'RELEASE', 'PREEMPT'].includes(request.value.type)
      ? usage.apply(request.value) : allocator.apply(request.value);
  }
  if (principal() !== 'supervisor') throw new Error('Regulator operator authority required.');
  const actions = {
    initialize: () => allocator.initializePool(fixture.poolQuery(), { capacity: fixture.CAPACITY, protectedReserve: fixture.RESERVE, consumed: 0 }),
    plan: () => source.plan(nativeSources, request.value), pool: () => allocator.pool(fixture.poolQuery()),
    allocation: () => allocator.allocation(request.value), outbox: () => allocator.outbox(fixture.poolQuery()),
    expose: () => usage.expose(request.value), usage: () => usage.state(request.value),
    ledger: () => aggregateMetabolicUsage(allocator.db, { ...fixture.SCOPE, missionId: fixture.MISSION }),
  };
  if (!Object.hasOwn(actions, request.action)) throw new Error('Unknown regulator test action.');
  return actions[request.action]();
}

function handleProvider(request) {
  if (!same(principal(), fixture.ACTORS.regulator) && principal() !== 'supervisor') throw new Error('Provider channel not authorized.');
  const actions = { perform: () => resources.provider.perform(request.value), count: () => resources.provider.completedCount(),
    lookup: () => resources.provider.lookup(request.value) };
  if (!Object.hasOwn(actions, request.action)) throw new Error('Unknown provider test action.');
  return actions[request.action]();
}

function handleClient(request) {
  if (request.action === 'receive' && same(principal(), fixture.ACTORS.regulator)) return resources.journal.record(request.value, 'inbound');
  if (principal() !== 'supervisor') throw new Error('Client operator authority required.');
  if (request.action === 'send') return resources.journal.record(request.value, 'outbound');
  if (request.action === 'inbox') return resources.journal.messages('inbound');
  throw new Error('Unknown client test action.');
}

async function dispatch(request) {
  if (role === 'regulator') return handleRegulator(request);
  if (role === 'provider') return handleProvider(request);
  return handleClient(request);
}

let queue = Promise.resolve();
process.on('message', request => {
  if (request.sourceReply) { sourceReply(request); return; }
  queue = queue.then(() => context.run({ principal: request.principal }, async () => {
    try { process.send({ id: request.id, value: await dispatch(request) }); }
    catch (error) { process.send({ id: request.id, error: `${request.action}: ${error.message}`, code: error.code }); }
  }));
});
process.on('disconnect', () => {
  resources.allocator?.close(); resources.journal?.close(); resources.provider?.close(); process.exit(0);
});

async function start() {
  if (role === 'regulator') await regulator();
  else if (role === 'provider') resources.provider = new MeasuredProvider(directory);
  else resources.journal = new ClientJournal(directory, role);
  process.send({ id: 'ready', value: { pid: process.pid } });
}
start().catch(error => { process.send({ id: 'ready', error: error.message }); process.exitCode = 1; });
