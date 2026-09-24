'use strict';

const { createPolicy } = require('./policyFactory');

module.exports = createPolicy({
  name: 'immune-critical',
  fit: { immunePlane: true },
  host: { identity: 'persistent', failClosed: true },
  admission: { requireContract: true, requireEvidence: true, trialRequired: true, quarantineUnknown: true },
  resources: { reserveForCore: true, allocationMode: 'risk-weighted' },
  immune: { mode: 'strict', rejectUnverified: true, requireIndependentVerifier: true },
  transmission: { core: 'VERTICAL_PREFERRED', peripheral: 'NEVER_INHERIT' },
  succession: { requireImmuneReview: true, requireVerifiedReplacement: true },
  stopConditions: { closeOnImmuneFailure: true, stopWhenHostRetired: true }
});
