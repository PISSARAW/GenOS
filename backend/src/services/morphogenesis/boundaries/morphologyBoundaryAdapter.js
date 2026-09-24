'use strict';

const ALLOWED_FIELDS = Object.freeze([
  'senderNode', 'receiverNode', 'kind', 'claims', 'artifacts', 'requests',
  'constraints', 'evidenceRefs', 'stateDeltaRefs', 'risk'
]);

function adaptBoundaryMessage(message, policy = {}) {
  const allowed = new Set(policy.allowedFields || []);
  const result = Object.fromEntries(ALLOWED_FIELDS.filter((field) => allowed.has(field) && message[field] !== undefined)
    .map((field) => [field, message[field]]));
  return { message: result, scratchpadShared: false, withheldFields: ALLOWED_FIELDS.filter((field) => !allowed.has(field)) };
}

module.exports = { ALLOWED_FIELDS, adaptBoundaryMessage };
