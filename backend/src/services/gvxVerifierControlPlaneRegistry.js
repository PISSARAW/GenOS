'use strict';

const implementations = new Map();
let sealed = false;

function registerVerifierImplementation(input) {
  const trust = require('./verifierTrustRegistry');
  if (sealed || !input || !trust.getVerifier(input.id) || !Array.isArray(input.requirements)
      || input.requirements.length === 0 || input.requirements.some((item) => typeof item !== 'string' || !item.trim())
      || typeof input.verify !== 'function' || implementations.has(input.id)) {
    throw Object.assign(new Error('trusted-gvx-verifier-implementation-invalid'), {
      code: 'GVX_VERIFIER_IMPLEMENTATION_INVALID'
    });
  }
  implementations.set(input.id, Object.freeze({ id: input.id,
    requirements: Object.freeze([...new Set(input.requirements)]), verify: input.verify }));
}

function resolveVerifierImplementation(id) {
  sealed = true;
  return implementations.get(id) || null;
}

module.exports = { registerVerifierImplementation, resolveVerifierImplementation };
