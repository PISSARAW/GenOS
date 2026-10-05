'use strict';

const PORTABLE = Object.freeze({ model: 'unknown-model', representations: ['portable'],
  maxTokens: null, prefixCache: false });

function createRegistry(profiles = {}) {
  const entries = new Map(Object.entries(profiles));
  function profile(model) {
    return entries.get(model) || PORTABLE;
  }
  function register(model, value) {
    if (!model || typeof model !== 'string' || !value || !Array.isArray(value.representations)) {
      throw new Error('model_abi_invalid');
    }
    entries.set(model, { model, maxTokens: null, prefixCache: false, ...value });
    return entries.get(model);
  }
  return { profile, register };
}

module.exports = { PORTABLE, createRegistry };
