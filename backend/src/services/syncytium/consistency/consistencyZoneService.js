'use strict';

const POLICIES = Object.freeze({
  EVENTUAL: { classification: 'GREEN', coordinationRequired: false },
  CAUSAL: { classification: 'AMBER', coordinationRequired: true },
  INVARIANT_PRESERVING: { classification: 'AMBER', coordinationRequired: true },
  SERIALIZABLE: { classification: 'RED', coordinationRequired: true },
  APPEND_ONLY: { classification: 'GREEN', coordinationRequired: false },
  IMMUTABLE: { classification: 'RED', coordinationRequired: true }
});

function resolve(schema, operation) {
  const path = String(operation?.kind?.key || '').trim();
  return schema?.fields?.[path]?.consistencyZone || 'EVENTUAL';
}

function policy(zone) {
  return POLICIES[zone] || POLICIES.EVENTUAL;
}

function validateMutation(zone, operation, sharedFields) {
  const path = String(operation?.kind?.key || '').trim();
  if (zone === 'IMMUTABLE' && Object.hasOwn(sharedFields, path)) {
    throw consistencyError('SYNCYTIUM_IMMUTABLE_FIELD', `Field '${path}' is immutable after its first value.`);
  }
  if (zone === 'APPEND_ONLY' && !isAppendOperation(operation)) {
    throw consistencyError('SYNCYTIUM_APPEND_ONLY_VIOLATION', `Operation '${operation.kind.action || operation.kind.type}' is not append-only for '${path}'.`);
  }
}

function isAppendOperation(operation) {
  if (operation.kind.type === 'typed_field') return ['add', 'increment', 'insert'].includes(operation.kind.action);
  return false;
}

function consistencyError(code, message) {
  return Object.assign(new Error(message), { code });
}

module.exports = { resolve, policy, validateMutation };
