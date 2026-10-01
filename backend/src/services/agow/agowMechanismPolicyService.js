'use strict';

const persistence = require('./agowStatePersistenceService');

const SCOPE = 'agow_mechanism_policy';
const MODES = new Set(['disabled', 'observe', 'shadow', 'advisory', 'bounded', 'live']);
const DEFAULT_POLICY = Object.freeze({
  regret: 'shadow', counterfactual: 'shadow', plasticity: 'observe',
  directPathways: 'disabled', proceduralization: 'disabled', markets: 'disabled'
});

function validPolicy(policy) {
  return Object.entries(policy || {}).every(([mechanism, mode]) =>
    Object.hasOwn(DEFAULT_POLICY, mechanism) && MODES.has(mode));
}

async function load(options) {
  const stored = await persistence.load({ scope: SCOPE, agentId: options.agentId, db: options.db });
  return { ...DEFAULT_POLICY, ...stored.state };
}

async function update(options) {
  if (!options?.agentId || !validPolicy(options.policy)) throw new TypeError('AGOW mechanism policy is invalid.');
  const current = await load(options);
  const policy = { ...current, ...options.policy };
  await persistence.save({ scope: SCOPE, agentId: options.agentId, db: options.db, state: policy, version: Date.now() });
  return policy;
}

function controlsRegret(mode) {
  return mode === 'bounded' || mode === 'live';
}

function publishesCounterfactual(mode) {
  return mode === 'advisory' || mode === 'bounded' || mode === 'live';
}

module.exports = { DEFAULT_POLICY, validPolicy, load, update, controlsRegret, publishesCounterfactual };
