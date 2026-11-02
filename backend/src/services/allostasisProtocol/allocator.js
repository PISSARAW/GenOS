'use strict';

const { withTransaction } = require('../../db');
const { TABLES_MODEL_ATTEMPTS } = require('../../db/schema-model-attempts');
const { digest } = require('../evidenceProtocol/canonical');
const { immutable } = require('../evidenceProtocol/conversation');
const { validateMessage, validateReport, validateForecast, validateAllocation, createMessage } = require('./contract');
const { AllocatorStore } = require('./allocatorStore');
const { NativeReservations } = require('./nativeReservations');
const nativeValues = require('./nativeReservationValues');
const v = require('./allocatorBindings');

class AllostasisAllocator {
  constructor(options) {
    for (const name of ['authorize', 'verifyRequest']) {
      if (typeof options[name] !== 'function') throw new Error(`ALLOSTASIS trusted ${name} callback required.`);
    }
    v.actor(options.actor); v.authority(options.authority); v.amount(options.incarnationGeneration);
    this.actor = immutable(options.actor); this.authority = immutable(options.authority);
    this.incarnationGeneration = options.incarnationGeneration;
    this.authorize = options.authorize; this.verifyRequest = options.verifyRequest;
    this.clock = options.clock || (() => Date.now());
    this.store = new AllocatorStore(options.dbPath || ':memory:'); this.db = this.store.db;
    this.native = new NativeReservations(this.db);
    this.ready = withTransaction(this.db, () => this.db.exec(TABLES_MODEL_ATTEMPTS));
    this.observations = typeof options.observations === 'function' ? options.observations(this.db) : options.observations;
    if (this.observations && this.observations.db !== this.db) throw new Error('ALLOSTASIS observations must share the allocator connection.');
  }

  close() { this.store.close(); }

  async allowed(operation, request) {
    if (await this.authorize(immutable({ operation, request })) !== true) throw new Error('ALLOSTASIS allocator authority rejected or revoked.');
  }

  async initializePool(inputQuery, input) {
    await this.ready;
    const query = v.poolQuery(inputQuery); v.configuration(input);
    if (query.unit === 'micro_USD') nativeValues.usd(input.capacity);
    await this.allowed('INITIALIZE_POOL', { query, ...input });
    return withTransaction(this.db, async () => {
      await this.allowed('INITIALIZE_POOL', { query, ...input });
      if (this.store.pool(query)) throw new Error('ALLOSTASIS pool already initialized.');
      const pool = { query, ...input, baselineConsumed: input.consumed, held: 0, generation: 0, regulator: this.actor };
      this.store.writePool(pool, null);
      return pool;
    });
  }

  async read(operation, query, getter) {
    await this.ready; await this.allowed(operation, query);
    return withTransaction(this.db, async () => {
      await this.allowed(operation, query);
      return getter();
    });
  }

  pool(input) {
    const query = v.poolQuery(input);
    return this.read('POOL', query, () => this.store.pool(query));
  }

  allocation(input) {
    const query = v.allocationQuery(input);
    return this.read('ALLOCATION', query, () => this.store.allocation(query));
  }

  outbox(input) {
    const query = v.poolQuery(input);
    return this.read('OUTBOX', query, () => this.store.outbox(query));
  }

  async forecast(message) {
    if (!this.observations || typeof this.observations.forecast !== 'function') throw new Error('ALLOSTASIS qualified observation registry required.');
    const value = await this.observations.forecast({ scope: message.scope, missionId: message.missionId,
      conversationId: message.conversationId, forecastId: message.payload.forecastId, forecastDigest: message.payload.forecastDigest });
    if (!v.same(value.message.sender, message.sender) || !v.same(value.message.audience, this.actor)) throw new Error('ALLOSTASIS forecast belongs to another client or regulator.');
    if (!v.same(value.message.generations, message.generations) || !v.same(value.message.authority, message.authority)) {
      throw new Error('ALLOSTASIS request authority or generations differ from its forecast.');
    }
    if (!message.causalRefs.includes(value.message.messageId)) throw new Error('ALLOSTASIS request must cite its registered forecast.');
    if (value.forecast.unit !== message.payload.unit) throw new Error('ALLOSTASIS request and forecast units differ.');
    return value;
  }

  response(message, type, payload) {
    const key = digest({ scope: message.scope, missionId: message.missionId, conversationId: message.conversationId,
      requestId: message.payload.requestId, sender: message.sender, regulator: this.actor, type });
    const now = this.clock();
    return createMessage({ messageId: key, idempotencyKey: key, operationId: message.operationId,
      missionId: message.missionId, conversationId: message.conversationId, scope: message.scope,
      sender: this.actor, audience: message.sender, authority: this.authority,
      generations: { ...message.generations, incarnation: this.incarnationGeneration },
      createdAt: new Date(typeof now === 'number' ? now : Date.parse(now)).toISOString(), expiresAt: message.expiresAt,
      causalRefs: [message.messageId], type, payload }, { now });
  }

  async grant(message, pool, verification) {
    const payload = message.payload;
    const requestDigest = digest(payload);
    const allocationId = digest({ scope: message.scope, missionId: message.missionId, conversationId: message.conversationId,
      requestId: payload.requestId, client: message.sender, regulator: this.actor });
    const allocation = validateAllocation({ allocationId, requestId: payload.requestId, requestDigest,
      budgetId: payload.budgetId, unit: payload.unit, amount: payload.amount, client: message.sender, regulator: this.actor,
      forecastId: payload.forecastId, forecastDigest: payload.forecastDigest, expiresAt: message.expiresAt });
    const state = { query: { scope: message.scope, missionId: message.missionId, conversationId: message.conversationId,
      allocationId, allocationDigest: digest(allocation) }, allocation, poolQuery: pool.query,
    status: 'active', spent: 0, held: payload.amount, released: 0, unknownExposure: 0, generation: 0,
    nativeReservation: null, verification };
    const next = { ...pool, held: v.amount(pool.held + payload.amount), generation: v.amount(pool.generation + 1) };
    if (payload.amount > v.available(pool)) throw new Error('ALLOSTASIS protected reserve admission rejected.');
    state.nativeReservation = await this.native.reserve(pool, state);
    this.store.writePool(next, pool); this.store.writeAllocation(state, null);
    const frame = this.response(message, 'GRANT', { allocation, allocationDigest: state.query.allocationDigest });
    this.store.enqueue(pool.query, frame);
    return { status: 'granted', query: state.query, allocation, allocationDigest: state.query.allocationDigest,
      poolGeneration: next.generation, outbound: [frame], allocationAuthorized: true, externalExecutionAuthorized: false };
  }

  reject(message, pool) {
    const payload = { requestId: message.payload.requestId, requestDigest: digest(message.payload), budgetId: pool.query.budgetId,
      unit: pool.query.unit, reason: 'insufficient_ordinary_capacity' };
    const frame = this.response(message, 'REJECT', payload);
    this.store.enqueue(pool.query, frame);
    return { status: 'rejected', ...payload, available: v.available(pool), outbound: [frame], allocationAuthorized: false };
  }

  async apply(input) {
    await this.ready;
    const message = validateMessage(input, { now: this.clock() });
    if (['REPORT_STATE', 'FORECAST_NEED', 'PRESSURE'].includes(message.type)) {
      if (!this.observations) throw new Error('ALLOSTASIS observation registry unavailable.');
      return this.observations.apply(message);
    }
    if (message.type !== 'REQUEST_BUDGET') throw new Error('ALLOSTASIS clients cannot install their own GRANT or pool authority.');
    if (!v.same(message.audience, this.actor) || v.same(message.sender, this.actor)) throw new Error('ALLOSTASIS budget request must come from a distinct client to this regulator.');
    if (message.payload.amount === 0) throw new Error('ALLOSTASIS zero budget request cannot create an allocation.');
    await this.allowed('REQUEST_BUDGET', message);
    return withTransaction(this.db, () => this.request(message));
  }

  async request(message) {
    await this.allowed('REQUEST_BUDGET', message);
    validateMessage(message, { now: this.clock() });
    const replay = this.store.replay(message);
    if (replay) return replay;
    const requested = this.store.requested(message);
    if (requested) { this.store.record(message, requested); return requested; }
    const pool = this.store.pool(v.messagePool(message));
    if (!pool || !v.same(pool.regulator, this.actor)) throw new Error('ALLOSTASIS authoritative pool unavailable.');
    const forecast = await this.forecast(message);
    const request = { message, pool, forecast };
    const verification = v.copy(await this.verifyRequest(immutable(request)));
    v.proof(verification, request);
    await this.allowed('REQUEST_BUDGET', message);
    const current = this.store.pool(pool.query);
    if (!v.same(current, pool)) throw new Error('ALLOSTASIS pool changed during request verification.');
    const latestForecast = await this.forecast(message);
    if (!v.same(forecast, latestForecast)) throw new Error('ALLOSTASIS forecast changed during budget admission.');
    validateMessage(message, { now: this.clock() });
    const result = message.payload.amount <= v.available(pool) ? await this.grant(message, pool, verification) : this.reject(message, pool);
    result.verification = verification;
    await this.allowed('REQUEST_BUDGET', message);
    const finalTime = { now: this.clock() };
    validateMessage(message, finalTime);
    validateMessage(latestForecast.message, finalTime);
    validateReport(latestForecast.report, finalTime);
    validateForecast(latestForecast.forecast, finalTime);
    const expectedPool = result.status === 'granted' ? { ...pool, held: pool.held + message.payload.amount, generation: pool.generation + 1 } : pool;
    if (!v.same(this.store.pool(pool.query), expectedPool)) throw new Error('ALLOSTASIS pool changed during final admission authorization.');
    this.store.recordRequest(message, result); this.store.record(message, result);
    return result;
  }
}

module.exports = { AllostasisAllocator };
