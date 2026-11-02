'use strict';

const { ResourceStore } = require('./resourceStore');
const v = require('./effectValidation');
const validation = require('./resourceValidation');

class OmegaEffectResource {
  constructor(options) {
    if (typeof options.authorize !== 'function' || typeof options.verifyEvidence !== 'function') {
      throw new Error('OMEGA receiver trusted authorize and verifyEvidence callbacks required.');
    }
    this.store = new ResourceStore(options.dbPath || ':memory:');
    this.authorize = options.authorize; this.verifyEvidence = options.verifyEvidence;
    this.clock = options.clock || (() => Date.now());
  }

  close() { this.store.close(); }
  authority(scope) { return this.store.authority(v.scope(v.copy(scope))); }
  effects(scope) { return this.store.effects(v.scope(v.copy(scope))); }
  value(input) {
    const query = v.copy(input); v.exact(query, ['scope', 'resourceId', 'action']);
    v.scope(query.scope); v.id(query.resourceId); v.id(query.action);
    return this.store.value(query);
  }

  async allowed(action, request) {
    if (await this.authorize(v.frozen({ action, request })) !== true) throw new Error('OMEGA receiver authority rejected or revoked.');
  }

  async bootstrap(input) {
    const request = validation.bootstrap(input);
    await this.allowed('bootstrap', request);
    return this.store.atomic(() => {
      if (this.store.authority(request.scope)) throw new Error('OMEGA receiver already bootstrapped.');
      const { scope, ...state } = request;
      this.store.save(scope, state);
      return state;
    });
  }

  async fenceAuthority(input) {
    const request = validation.fence(input);
    await this.allowed('fence', request);
    return this.store.atomic(() => {
      const state = this.store.authority(request.scope);
      validation.current(state, { actor: request.previousActor, authority: request.previousAuthority });
      const next = { ...state, actor: request.actor, authority: request.authority };
      this.store.save(request.scope, next);
      return next;
    });
  }

  async execute(input) {
    const request = v.request(input);
    v.freshness(request, this.clock());
    await this.allowed('execute', request);
    const proof = await this.verifyEvidence(v.frozen(request));
    if (!v.verified(proof, request)) throw new Error('OMEGA receiver applicable evidence rejected.');
    await this.allowed('execute', request);
    return this.store.atomic(() => {
      v.freshness(request, this.clock());
      const state = this.store.authority(request.scope);
      validation.applicable(state, request);
      const replay = this.store.receipt(request);
      if (replay) return replay;
      const spent = state.budget.spent + request.cost;
      if (!Number.isSafeInteger(spent) || spent > state.budget.limit - state.budget.reserved) throw new Error('OMEGA receiver budget exhausted.');
      const receipt = v.completed(request, request.candidate);
      this.store.write(request, receipt);
      this.store.save(request.scope, { ...state, budget: { ...state.budget, spent } });
      return receipt;
    });
  }

  async reconcile(input) {
    const request = v.request(input);
    await this.allowed('reconcile', request);
    return this.store.atomic(() => this.store.receipt(request) || v.notApplied(request));
  }
}

module.exports = { OmegaEffectResource };
