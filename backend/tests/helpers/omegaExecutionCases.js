'use strict';

const catalog = require('../../../shared/cognitiveOmegaSemanticHandlers.json');

function domainCase(base, domain) {
  const value = structuredClone(base);
  const semantic = catalog.handlers[domain];
  const refs = { SELECT: semantic.selector, CALL: semantic.tool, INFER: semantic.infer,
    CHECK: `epistemic/${domain}`, EMIT: semantic.effect };
  const fields = { CALL: 'toolResults', INFER: 'inferenceResults', CHECK: 'verificationReceipts', EMIT: 'emissionResults' };
  value.name = domain;
  value.envelope.payload = { domain, verification: semantic.verification };
  for (const op of value.envelope.operations.filter((op) => op.kind !== 'READ')) {
    const previous = op.reference;
    op.reference = refs[op.kind];
    value.envelope.policy[op.kind.toLowerCase()] = [op.reference];
    if (fields[op.kind]) value[fields[op.kind]] = { [op.reference]: value[fields[op.kind]][previous] };
  }
  return value;
}

function rejected(base, changes) {
  const value = structuredClone(base);
  changes.mutate(value);
  value.name = changes.name;
  value.expectedKinds = value.expectedKinds.slice(0, changes.operations);
  value.expectedStatuses = value.expectedStatuses.slice(0, changes.operations);
  value.expectedStatuses[value.expectedStatuses.length - 1] = 'blocked';
  value.expectedReason = changes.reason;
  return value;
}

function cases(base) {
  return [...Object.keys(catalog.handlers).map((domain) => domainCase(base, domain)),
    rejected(base, { name: 'denied-call', operations: 3, reason: 'call_not_authorized',
      mutate: (value) => { value.envelope.policy.call = []; } }),
    rejected(base, { name: 'missing-read', operations: 1, reason: 'reader_missing',
      mutate: (value) => { value.objects = {}; } }),
    rejected(base, { name: 'denied-effect', operations: 6, reason: 'emit_not_authorized',
      mutate: (value) => { value.allowEmit = false; } }),
    rejected(base, { name: 'contradictory-proof', operations: 5, reason: 'verification_failed',
      mutate: (value) => { value.verificationReceipts['epistemic/runtime'] = { valid: true, status: 'refuted' }; } })];
}
module.exports = { cases };
