'use strict';

const VERTICAL_POLICIES = Object.freeze(['VERTICAL_REQUIRED', 'VERTICAL_PREFERRED', 'HORIZONTAL_OK']);
const REACQUIRE_POLICIES = Object.freeze(['REACQUIRE', 'REACQUIRE_EACH_GENERATION']);

function policyError(message, code = 'HOLOBIONT_TRANSMISSION_POLICY_INVALID') {
  return Object.assign(new Error(message), { code });
}

function normalize(value) {
  return String(value || 'NEVER_INHERIT').trim().toUpperCase();
}

function decideInheritance(hostPolicy, contractPolicy) {
  const host = normalize(hostPolicy);
  const contract = normalize(contractPolicy);
  if (contract === 'VERTICAL_REQUIRED' && ['NEVER_INHERIT', 'REACQUIRE', 'REACQUIRE_EACH_GENERATION'].includes(host)) {
    throw policyError('Host policy conflicts with a required vertical contract.', 'HOLOBIONT_TRANSMISSION_CONFLICT');
  }
  if (host === 'NEVER_INHERIT' || contract === 'NEVER_INHERIT') return { inherit: false, reason: 'NEVER_INHERIT' };
  if (REACQUIRE_POLICIES.includes(host) || REACQUIRE_POLICIES.includes(contract)) {
    return { inherit: false, reacquire: true, reason: 'REACQUIRE_EACH_GENERATION' };
  }
  if (contract === 'HORIZONTAL_OK') return { inherit: false, horizontalAcquisition: true, reason: 'HORIZONTAL_ACQUISITION_REQUIRED' };
  if (!VERTICAL_POLICIES.includes(host) || !VERTICAL_POLICIES.includes(contract)) {
    throw policyError('Unknown Host or contract transmission policy.');
  }
  return { inherit: true, required: contract === 'VERTICAL_REQUIRED', reason: 'POLICY_ALLOWED' };
}

module.exports = { decideInheritance };
