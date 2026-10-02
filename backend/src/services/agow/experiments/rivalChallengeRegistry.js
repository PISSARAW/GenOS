'use strict';

const controlMatcher = require('./rivalControlMatcher');

const CHALLENGES = Object.freeze(['gmw', 'ctm', 'araya', 'mbh', 'lipson', 'jspace']);

function validate(challenge) {
  validateIdentity(challenge);
  validateFields(challenge);
  controlMatcher.validate({ ...challenge, baseline: armLocks(challenge), treatment: armLocks(challenge) });
  return challenge;
}

function validateIdentity(challenge) {
  if (!challenge || !CHALLENGES.includes(challenge.challenge)) throw new Error('rival-challenge-unknown');
}

function validateFields(challenge) {
  for (const field of ['baseline', 'treatment', 'modelLock', 'toolLock', 'budget', 'topologyProfile', 'verifierProfile']) {
    if (!challenge[field] || typeof challenge[field] !== 'object' || Array.isArray(challenge[field])) {
      throw new Error(`rival-challenge-${field}-required`);
    }
  }
  if (!Array.isArray(challenge.seeds) || !challenge.seeds.length || !Array.isArray(challenge.metrics)
    || !Array.isArray(challenge.ablations)) throw new Error('rival-challenge-design-invalid');
  if (!(Number(challenge.budget.world) > 0)) throw new Error('rival-challenge-world-budget-invalid');
}

function armLocks(challenge) {
  return { modelLock: challenge.modelLock, toolLock: challenge.toolLock, budget: challenge.budget };
}

function createRegistry(challenges = []) {
  const entries = new Map();
  for (const challenge of challenges) register(entries, challenge);
  return Object.freeze({ get: (name) => entries.get(name) || null, list: () => [...entries.values()] });
}

function register(entries, challenge) {
  const value = validate(challenge);
  if (entries.has(value.challenge)) throw new Error('rival-challenge-duplicate');
  entries.set(value.challenge, structuredClone(value));
}

module.exports = { CHALLENGES, validate, createRegistry };
