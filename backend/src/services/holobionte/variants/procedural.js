'use strict';

const { createPolicy } = require('./policyFactory');

module.exports = createPolicy({
  name: 'procedural',
  fit: { succession: true },
  host: { identity: 'persistent', executionStyle: 'procedural', capabilityGapResponse: 'contracted-recruitment' },
  admission: { requireContract: true, requireEvidence: true, trialRequired: true },
  resources: { reserveForCore: true, allocationMode: 'bounded' },
  immune: { mode: 'adaptive', rejectUnverified: true },
  transmission: { core: 'VERTICAL_PREFERRED', peripheral: 'REACQUIRE_EACH_GENERATION' },
  succession: { enabled: true, requireVerifiedReplacement: true },
  stopConditions: { closeAfterMission: true, stopWhenHostRetired: true }
});