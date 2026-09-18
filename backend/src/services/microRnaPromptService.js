'use strict';

function createMicroRna(target, action = 'suppress', options = {}) {
  return { target: String(target || ''), action, threshold: Number(options.threshold) || 0, expiresAt: options.ttlMs ? Date.now() + Number(options.ttlMs) : null };
}

function regulatePrompt(genome, regulators, options = {}) {
  const state = options.state || {};
  const now = options.now || Date.now();
  const active = (Array.isArray(regulators) ? regulators : []).filter((item) => !item.expiresAt || item.expiresAt > now);
  return active.reduce((current, regulator) => {
    const level = Number(state[regulator.target] || 0);
    if (level < regulator.threshold) return current;
    if (regulator.action === 'suppress') {
      return { ...current, repressors: [...new Set([...(current.repressors || []), regulator.target])] };
    }
    return { ...current, enhancers: [...new Set([...(current.enhancers || []), regulator.target])] };
  }, { ...genome });
}

module.exports = { createMicroRna, regulatePrompt };
