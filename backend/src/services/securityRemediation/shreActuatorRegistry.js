'use strict';

const adapters = new Map();
const REQUIRED_METHODS = ['simulate', 'apply', 'rollback'];
const verifiers = new Map();

function registerActuator(actuator) {
  if (!actuator || typeof actuator.id !== 'string' || !actuator.id.trim()) {
    throw new Error('SHRE_ACTUATOR_ID_REQUIRED');
  }
  if (!REQUIRED_METHODS.every((method) => typeof actuator[method] === 'function')) {
    throw new Error('SHRE_ACTUATOR_CONTRACT_INCOMPLETE');
  }
  adapters.set(actuator.id, actuator);
  return { id: actuator.id, registered: true };
}

function getActuator(actuatorId) {
  const actuator = adapters.get(actuatorId);
  if (!actuator) throw new Error('SHRE_SPECIALIZED_ACTUATOR_UNAVAILABLE');
  return actuator;
}

function registerVerifier(verifier) {
  if (!verifier || typeof verifier.id !== 'string' || !verifier.id.trim()
      || typeof verifier.counterTest !== 'function') throw new Error('SHRE_VERIFIER_CONTRACT_INCOMPLETE');
  verifiers.set(verifier.id, verifier);
  return { id: verifier.id, registered: true };
}

function getVerifier(verifierId) {
  const verifier = verifiers.get(verifierId);
  if (!verifier) throw new Error('SHRE_INDEPENDENT_VERIFIER_UNAVAILABLE');
  return verifier;
}

function clearActuator(actuatorId) {
  adapters.delete(actuatorId);
}

function clearVerifier(verifierId) {
  verifiers.delete(verifierId);
}

module.exports = { registerActuator, getActuator, registerVerifier, getVerifier, clearActuator, clearVerifier };
