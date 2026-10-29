'use strict';

const HOST_TRUST_MODE = 'operator_trusted_host';

function isDockerCheck(check) {
  return check?.sandbox?.runtime === 'docker';
}

function hostChecks(checks = []) {
  return (Array.isArray(checks) ? checks : []).map((check, index) => ({ check, index }))
    .filter((entry) => !isDockerCheck(entry.check));
}

function untrustedHostChecks(checks = []) {
  return hostChecks(checks).filter(({ check }) => check?.trustMode !== HOST_TRUST_MODE)
    .map(({ check, index }) => ({ index, command: [check?.program, ...(check?.args || [])].join(' ') }));
}

function hostVerificationEvidence(check) {
  if (isDockerCheck(check)) return null;
  if (check?.trustMode !== HOST_TRUST_MODE) throw new Error('verification-hote-confiance-operateur-requise');
  return { runtime: 'host', trustMode: HOST_TRUST_MODE };
}

function validHostVerificationEvidence(evidence, check) {
  return !isDockerCheck(check) && check?.trustMode === HOST_TRUST_MODE
    && evidence?.runtime === 'host' && evidence?.trustMode === HOST_TRUST_MODE;
}

module.exports = { HOST_TRUST_MODE, isDockerCheck, hostChecks, untrustedHostChecks,
  hostVerificationEvidence, validHostVerificationEvidence };
