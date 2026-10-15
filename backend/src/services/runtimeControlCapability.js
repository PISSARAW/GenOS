'use strict';

const lease = require('./runtimeControlCapabilityLease');

const PROTOCOL_VERSION = 2;
const READY_TYPE = 'genos-runtime-control-ready';
const ACTIONS = Object.freeze([
  'pause', 'resume', 'cancel', 'resume_checkpoint', 'capture_checkpoint'
]);
const LINEAGE_FIELDS = Object.freeze([
  'workerId', 'missionId', 'episodeId', 'threadId', 'organizationId', 'projectId'
]);
const attestations = new WeakMap();
const bindings = new WeakMap();

function exactLineage(left, right) {
  return LINEAGE_FIELDS.every(field => typeof left?.[field] === 'string'
    && left[field] && left[field] === right?.[field]);
}

function exactActions(actions) {
  return Array.isArray(actions) && actions.length === ACTIONS.length
    && ACTIONS.every((action, index) => actions[index] === action);
}

function validReady(child, message) {
  return child.connected === true && message?.type === READY_TYPE
    && message.protocolVersion === PROTOCOL_VERSION
    && exactLineage(message.lineage, child.genosControlIdentity)
    && exactActions(message.actions);
}

function revoke(child) {
  attestations.delete(child);
}

function renew(child, message) {
  const binding = bindings.get(child);
  const attestation = attestations.get(child);
  if (!binding) return false;
  if (binding.poisoned) return false;
  if (!attestation) {
    binding.readySeen = true;
    binding.poisoned = true;
    return false;
  }
  const nextLease = lease.renew(attestation.lease, message, {
    lineage: attestation.lineage
  });
  if (!nextLease) {
    binding.poisoned = true;
    revoke(child);
    return false;
  }
  attestations.set(child, Object.freeze({ ...attestation, lease: nextLease }));
  return true;
}

function observe(child, message) {
  if (message?.type === lease.RENEW_TYPE) return renew(child, message);
  if (message?.type !== READY_TYPE) return false;
  const binding = bindings.get(child);
  if (!binding || binding.readySeen || !validReady(child, message)) {
    if (binding) {
      binding.readySeen = true;
      binding.poisoned = true;
    }
    revoke(child);
    return false;
  }
  binding.readySeen = true;
  attestations.set(child, Object.freeze({
    protocolVersion: PROTOCOL_VERSION,
    lineage: Object.freeze({ ...message.lineage }),
    actions: ACTIONS,
    lease: lease.start()
  }));
  return true;
}

function cleanup(child) {
  const binding = bindings.get(child);
  if (!binding) return;
  child.removeListener('message', binding.onMessage);
  child.removeListener('close', binding.onUnavailable);
  child.removeListener('disconnect', binding.onUnavailable);
  bindings.delete(child);
  revoke(child);
}

function bind(child) {
  if (!child || child.connected !== true || typeof child.on !== 'function'
    || typeof child.once !== 'function' || typeof child.removeListener !== 'function') return false;
  if (bindings.has(child)) return true;
  const binding = { readySeen: false, poisoned: false };
  binding.onMessage = message => observe(child, message);
  binding.onUnavailable = () => cleanup(child);
  bindings.set(child, binding);
  child.on('message', binding.onMessage);
  child.once('close', binding.onUnavailable);
  child.once('disconnect', binding.onUnavailable);
  return true;
}

function supports(child, action, protocolVersion = PROTOCOL_VERSION) {
  const binding = bindings.get(child);
  const attestation = attestations.get(child);
  const valid = child?.connected === true && binding && !binding.poisoned && attestation
    && protocolVersion === attestation.protocolVersion
    && attestation.actions.includes(action)
    && lease.fresh(attestation.lease)
    && exactLineage(attestation.lineage, child.genosControlIdentity);
  if (!valid) revoke(child);
  return Boolean(valid);
}

module.exports = { ACTIONS, PROTOCOL_VERSION, READY_TYPE, bind, supports };
