'use strict';

const { digest } = require('../evidenceProtocol/canonical');
const { FenceStore } = require('./fenceStore');
const { request, resourceContext, same, freeze } = require('./fenceValidation');

function receipt(status, value) {
  return { ...value, status, receiptDigest: digest({ profile: 'genos.continuity.fence/receipt/v1', status, ...value }) };
}

function requireCurrent(current, owner, generation) {
  if (!current || current.generation !== generation || !same(current.owner, owner)) {
    throw new Error('CONTINUITY stale authority owner or generation.');
  }
}

class FencedResource {
  constructor(options) {
    if (typeof options.authorize !== 'function') throw new Error('CONTINUITY trusted authorize callback required.');
    this.authorize = options.authorize;
    this.store = new FenceStore(options.dbPath || ':memory:');
  }

  bootstrap(input) { return this.apply('bootstrap', input); }
  transfer(input) { return this.apply('transfer', input); }
  execute(input) { return this.apply('execute', input); }
  authority(context) { return this.store.authority(resourceContext(context)); }
  effects(context) { return this.store.effects(resourceContext(context)); }
  value(context, item) { return this.store.value(resourceContext(context), item); }
  close() { this.store.close(); }

  async apply(action, input) {
    const value = request(action, input);
    const authorization = freeze({ action, request: structuredClone(value) });
    if (await this.authorize(authorization) !== true) throw new Error('CONTINUITY resource authorization rejected.');
    return this.store.atomic(() => {
      const current = this.store.authority(value);
      if (action === 'execute') requireCurrent(current, value.actor, value.generation);
      const replay = this.store.replay(action, value);
      if (replay) return replay;
      return this.commit(action, value, current);
    });
  }

  commit(action, value, current) {
    const actions = {
      bootstrap: () => this.initialize(value, current),
      transfer: () => this.activate(value, current),
      execute: () => this.effect(value, current),
    };
    const result = actions[action]();
    this.store.record(action, value, result);
    return result;
  }

  initialize(value, current) {
    if (current) throw new Error('CONTINUITY authority already bootstrapped.');
    this.store.saveAuthority(value, { owner: value.owner, generation: value.generation,
      permissions: value.permissions, budget: value.budget });
    return receipt('initialized', value);
  }

  activate(value, current) {
    requireCurrent(current, value.previousOwner, value.previousGeneration);
    if (value.permissions.some(permission => !current.permissions.includes(permission))) {
      throw new Error('CONTINUITY transfer cannot increase permissions.');
    }
    if (!same(value.budget, current.budget)) throw new Error('CONTINUITY transfer must conserve authoritative budget.');
    this.store.saveAuthority(value, { owner: value.successor, generation: value.newGeneration,
      permissions: value.permissions, budget: current.budget });
    return receipt('activated', value);
  }

  effect(value, current) {
    requireCurrent(current, value.actor, value.generation);
    if (!current.permissions.includes(value.resourceId)) throw new Error('CONTINUITY resource permission denied.');
    const nextSpent = current.budget.spent + value.cost;
    if (!Number.isSafeInteger(nextSpent) || nextSpent + current.budget.reserved > current.budget.limit) {
      throw new Error('CONTINUITY resource budget exhausted.');
    }
    const nextAuthority = { ...current, budget: { ...current.budget, spent: nextSpent } };
    this.store.write(value);
    this.store.saveAuthority(value, nextAuthority);
    return receipt('applied', value);
  }
}

module.exports = { FencedResource };
