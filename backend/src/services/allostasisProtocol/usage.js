'use strict';

const { withTransaction } = require('../../db');
const { digest } = require('../evidenceProtocol/canonical');
const { validateMessage } = require('./contract');
const { UsageStore } = require('./usageStore');
const transitions = require('./usageTransitions');
const nativeLedger = require('./usageLedger');
const v = require('./usageBindings');

function result(status, query, values) {
  const body = { status, ...query, ...values, noRefundOfConsumption: true, morphogenesisAuthorized: false };
  return { ...body, receiptDigest: digest({ profile: 'genos.allostasis.usage/v1', ...body }) };
}

class AllostasisUsage {
  constructor(options) {
    for (const name of ['authorize', 'verifyUsage']) {
      if (typeof options[name] !== 'function') throw new Error(`ALLOSTASIS usage trusted ${name} required.`);
    }
    this.allocator = options.allocator;
    if (!this.allocator?.db || !this.allocator?.store) throw new Error('ALLOSTASIS usage requires the actual allocator connection.');
    this.db = this.allocator.db;
    this.store = new UsageStore(this.db);
    this.authorize = options.authorize; this.verifyUsage = options.verifyUsage;
    this.clock = options.clock || (() => Date.now());
    this.ready = this.initialize();
  }

  async initialize() {
    await this.allocator.ready;
    await withTransaction(this.db, async () => { await this.store.initialize(); await nativeLedger.initialize(this.db); });
  }

  async allowed(operation, request) {
    if (await this.authorize(v.frozen({ operation, request })) !== true) throw new Error('ALLOSTASIS usage authority rejected or revoked.');
  }

  allocation(query) {
    const state = this.allocator.store.allocation(query);
    if (!state || !v.same(state.query, query)) throw new Error('ALLOSTASIS usage allocation scope or digest mismatch.');
    v.unit(state.allocation.unit);
    return state;
  }

  requireLive(allocation) {
    const now = this.clock();
    const current = typeof now === 'number' ? now : Date.parse(now);
    const deadline = Date.parse(allocation.allocation.expiresAt);
    if (!Number.isFinite(current) || !Number.isFinite(deadline) || deadline <= current) throw new Error('ALLOSTASIS allocation expired or clock invalid.');
  }

  async persist(change, previous) {
    const nativeBridge = await this.allocator.native.syncHeld(change.pool, change.allocation);
    change.allocation.nativeBridge = nativeBridge;
    this.allocator.store.writePool(change.pool, previous.pool);
    this.allocator.store.writeAllocation(change.allocation, previous.allocation);
  }

  async expose(input) {
    await this.ready;
    const request = v.exposure(input);
    await this.allowed('EXPOSE', request);
    return withTransaction(this.db, async () => {
      await this.allowed('EXPOSE', request);
      const allocation = this.allocation(request.query);
      this.requireLive(allocation);
      const operations = await this.store.operations(request.query);
      const started = transitions.begin(allocation, operations, request);
      await this.allowed('EXPOSE', request);
      this.requireLive(allocation);
      if (!started.duplicate) {
        const next = { ...allocation, unknownExposure: transitions.exposureTotal([...operations, started.operation]),
          generation: v.amount(allocation.generation + 1) };
        this.allocator.store.writeAllocation(next, allocation);
        await this.store.writeOperation(started.operation);
      }
      return result(started.duplicate ? 'exposure_existing' : 'exposure_recorded', request.query,
        { operationId: request.operationId, maximumAmount: request.maximumAmount, effectDispatched: false,
          newDispatchAuthorized: false, reconciliationRequired: started.duplicate && !started.operation.final });
    });
  }

  participants(message, allocation) {
    const preempt = message.type === 'PREEMPT' || message.payload.reason === 'preempt';
    const sender = preempt ? allocation.regulator : allocation.client;
    const audience = preempt ? allocation.client : allocation.regulator;
    if (!v.same(message.sender, sender) || !v.same(message.audience, audience)) throw new Error('ALLOSTASIS usage actor or audience mismatch.');
  }

  async apply(input) {
    await this.ready;
    const message = validateMessage(input, { now: this.clock() });
    if (!['REPORT_USAGE', 'RELEASE', 'PREEMPT'].includes(message.type)) throw new Error('ALLOSTASIS usage message unsupported.');
    const query = v.query({ scope: message.scope, missionId: message.missionId, conversationId: message.conversationId,
      allocationId: message.payload.allocationId, allocationDigest: message.payload.allocationDigest });
    await this.allowed(message.type, message);
    return withTransaction(this.db, async () => {
      await this.allowed(message.type, message);
      validateMessage(message, { now: this.clock() });
      const replay = await this.store.replay(message);
      if (replay) return replay;
      const allocation = this.allocation(query);
      this.participants(message, allocation.allocation);
      const response = message.type === 'REPORT_USAGE' ? await this.report(message, allocation) : await this.release(message, allocation);
      await this.allowed(message.type, message);
      validateMessage(message, { now: this.clock() });
      await this.store.record(message, response);
      return response;
    });
  }

  async report(message, allocation) {
    const report = message.payload;
    if (report.unit !== allocation.allocation.unit) throw new Error('ALLOSTASIS usage unit differs from allocation.');
    const query = allocation.query;
    const observed = await this.store.observation(query, report.receiptId);
    if (observed) {
      if (!v.same(observed.report, report)) throw new Error('ALLOSTASIS usage receipt idempotency conflict.');
      return observed.result;
    }
    const operation = await this.store.operation(query, report.operationId);
    if (!operation) throw new Error('ALLOSTASIS usage must follow a durable exposure intent.');
    const request = { query, allocation: allocation.allocation, report };
    const proof = v.proof(await this.verifyUsage(v.frozen(request)), request);
    if (proof.status !== report.status || proof.cumulativeAmount !== report.cumulativeAmount) throw new Error('ALLOSTASIS source usage differs from reported cumulative amount.');
    const updated = transitions.observed(operation, proof);
    if (allocation.allocation.unit === 'milliseconds') {
      if (operation.metricId && proof.metricId !== operation.metricId) throw new Error('ALLOSTASIS cumulative time metric cannot change.');
      updated.metricId = proof.metricId;
    }
    const operations = (await this.store.operations(query)).map(value => value.operationId === updated.operationId ? updated : value);
    const pool = this.allocator.store.pool(allocation.poolQuery);
    const change = transitions.charge({ allocation, pool, previous: operation, operation: updated, operations });
    await this.store.writeOperation(updated);
    const nativeObservationId = await nativeLedger.record(this.db, { query, allocation: allocation.allocation, proof,
      delta: change.delta, receiptId: report.receiptId, operationId: report.operationId });
    await this.persist(change, { allocation, pool });
    const response = result(proof.status === 'unknown' ? 'usage_unknown' : 'usage_recorded', query,
      { operationId: report.operationId, spent: change.allocation.spent, held: change.allocation.held,
        unknownExposure: change.allocation.unknownExposure, final: proof.final, overBudget: change.overBudget,
        nativeObservationId, nativeBridge: change.allocation.nativeBridge });
    await this.store.observe({ query, receiptId: report.receiptId, operationId: report.operationId, report, proof, result: response });
    return response;
  }

  async release(message, allocation) {
    const identifier = message.type === 'PREEMPT' ? message.messageId : message.payload.releaseId;
    const releaseId = digest([message.type, message.sender, message.audience, identifier]);
    const prior = await this.store.release(allocation.query, releaseId);
    if (prior) {
      if (prior.fingerprint !== digest(message.payload)) throw new Error('ALLOSTASIS release identity idempotency conflict.');
      return JSON.parse(prior.result_json);
    }
    const pool = this.allocator.store.pool(allocation.poolQuery);
    const reason = message.type === 'PREEMPT' ? 'preempt' : message.payload.reason;
    const change = transitions.release(allocation, pool, reason);
    await this.persist(change, { allocation, pool });
    if (change.allocation.held === 0 && change.allocation.unknownExposure === 0) {
      await this.allocator.native.settle(change.pool, change.allocation, { providerCalled: true });
    }
    const response = result('allocation_closed', allocation.query, { allocationStatus: change.allocation.status,
      spent: change.allocation.spent, released: change.released, held: change.allocation.held,
      unknownExposure: change.allocation.unknownExposure, protectedReserve: change.pool.protectedReserve,
      nativeBridge: change.allocation.nativeBridge });
    await this.store.recordRelease({ query: allocation.query, releaseId, payload: message.payload, result: response });
    return response;
  }

  async state(input) {
    await this.ready;
    const query = v.query(input);
    await this.allowed('USAGE_STATE', query);
    return withTransaction(this.db, async () => {
      const allocation = this.allocation(query);
      const operations = await this.store.operations(query);
      const history = await this.store.history(query);
      await this.allowed('USAGE_STATE', query);
      return { allocation, operations, history };
    });
  }

  reconcile(input) {
    if (input?.type !== 'REPORT_USAGE') throw new Error('ALLOSTASIS reconciliation requires a fresh scoped usage report.');
    return this.apply(input);
  }
}

module.exports = { AllostasisUsage };
