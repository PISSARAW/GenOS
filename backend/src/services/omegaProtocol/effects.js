'use strict';

const { digest } = require('../evidenceProtocol/canonical');
const { EffectStore } = require('./effectStore');
const v = require('./effectValidation');

function callbacks(options) {
  for (const name of ['authorize', 'verifyEvidence', 'dispatch', 'reconcile']) {
    if (typeof options[name] !== 'function') throw new Error(`OMEGA trusted ${name} callback required.`);
  }
}

class EffectGate {
  constructor(options) {
    callbacks(options);
    this.store = new EffectStore(options.dbPath || ':memory:');
    this.authorize = options.authorize; this.verifyEvidence = options.verifyEvidence;
    this.dispatch = options.dispatch; this.reconcile = options.reconcile;
    this.clock = options.clock || (() => Date.now());
  }

  state(query) { return this.store.state(v.query(query).effectKey); }
  history(query) { return this.store.history(v.query(query).effectKey); }
  close() { this.store.close(); }

  async allowed(action, request) {
    if (await this.authorize(v.frozen({ action, request })) !== true) throw new Error('OMEGA effect authority rejected or revoked.');
  }

  async applicable(action, request) {
    v.freshness(request, this.clock());
    await this.allowed(action, request);
    const receipt = await this.verifyEvidence(v.frozen(request));
    if (!v.verified(receipt, request)) throw new Error('OMEGA applicable evidence binding rejected.');
    await this.allowed(action, request);
    v.freshness(request, this.clock());
    return receipt;
  }

  async requestEffect(input) {
    const request = v.request(input);
    await this.allowed('request', request);
    return this.store.atomic(() => {
      const existing = this.store.match(request);
      if (existing) return existing;
      v.freshness(request, this.clock());
      const state = { request, status: 'requested', attempt: 0 };
      this.store.change(state, 'REQUEST_EFFECT');
      return state;
    });
  }

  async authorizeEffect(query) {
    const expected = this.required(query);
    if (expected.status !== 'requested') throw new Error('OMEGA effect request is not awaiting authorization.');
    const verification = await this.applicable('authorize', expected.request);
    return this.store.atomic(() => {
      this.store.compare(expected);
      const state = { ...expected, status: 'authorized', verification };
      this.store.change(state, 'AUTHORIZE_EFFECT');
      return state;
    });
  }

  required(query) {
    const state = this.store.state(v.query(query).effectKey);
    if (!state) throw new Error('OMEGA unknown effect request.');
    return state;
  }

  outcome(state) {
    return state.status === 'completed' ? state.receipt : {
      status: 'effect_outcome_unknown', effectKey: state.request.effectKey, requestDigest: digest(state.request),
    };
  }

  async dispatchEffect(query) {
    const expected = this.required(query);
    if (['completed', 'effect_outcome_unknown', 'dispatching'].includes(expected.status)) {
      await this.allowed('reconcile', expected.request);
      return this.outcome(expected);
    }
    if (expected.status !== 'authorized') throw new Error('OMEGA effect is not authorized for dispatch.');
    await this.applicable('dispatch', expected.request);
    const pending = this.store.atomic(() => {
      this.store.compare(expected);
      const state = { ...expected, status: 'dispatching', attempt: expected.attempt + 1 };
      this.store.change(state, 'DISPATCH_INTENT');
      return state;
    });
    try {
      const receipt = await this.dispatch(v.frozen(pending.request));
      if (!v.validReceipt(receipt, pending.request)) throw new Error('OMEGA effect receipt binding rejected.');
      return this.complete(pending.request, receipt);
    } catch (error) {
      return this.store.atomic(() => {
        const current = this.required(query);
        if (current.status === 'completed') return current.receipt;
        current.status = 'effect_outcome_unknown';
        current.reason = String(error.message || error).slice(0, 1000);
        this.store.change(current, 'EFFECT_OUTCOME_UNKNOWN');
        return this.outcome(current);
      });
    }
  }

  complete(request, receipt) {
    return this.store.atomic(() => {
      const current = this.store.match(request);
      if (current.status === 'completed') {
        if (!v.same(current.receipt, receipt)) throw new Error('OMEGA conflicting historical effect receipt.');
        return current.receipt;
      }
      current.status = 'completed'; current.receipt = v.copy(receipt);
      this.store.change(current, 'EFFECT_RECEIPT');
      return v.copy(receipt);
    });
  }

  async effect(input) {
    let state = await this.requestEffect(input);
    const query = { effectKey: state.request.effectKey };
    if (state.status === 'requested') state = await this.authorizeEffect(query);
    if (state.status === 'authorized') return this.dispatchEffect(query);
    return this.outcome(state);
  }

  async reconcileEffect(query) {
    const expected = this.required(query);
    await this.allowed('reconcile', expected.request);
    if (expected.status === 'completed') return expected.receipt;
    if (!['dispatching', 'effect_outcome_unknown'].includes(expected.status)) throw new Error('OMEGA reconciliation requires uncertain dispatch.');
    let result;
    try { result = await this.reconcile(v.frozen(expected.request)); }
    catch { return this.outcome(expected); }
    if (v.validReceipt(result, expected.request)) return this.complete(expected.request, result);
    if (!v.validNotApplied(result, expected.request)) return this.outcome(expected);
    return this.store.atomic(() => {
      this.store.compare(expected);
      const state = { ...expected, status: 'not_applied', reconciliation: result };
      this.store.change(state, 'NOT_APPLIED_ATTESTED');
      return { status: 'not_applied', effectKey: expected.request.effectKey, requestDigest: digest(expected.request) };
    });
  }

  async retryEffect(query) {
    const expected = this.required(query);
    if (expected.status !== 'not_applied') throw new Error('OMEGA retry requires trusted NOT_APPLIED attestation.');
    await this.applicable('retry', expected.request);
    this.store.atomic(() => {
      this.store.compare(expected);
      this.store.change({ ...expected, status: 'requested' }, 'EXPLICIT_RETRY_AUTHORIZED');
    });
    return this.effect(expected.request);
  }
}

module.exports = { EffectGate };
