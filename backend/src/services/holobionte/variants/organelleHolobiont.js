'use strict';

const { createPolicy } = require('./policyFactory');

module.exports = createPolicy({
  name: 'organelle',
  fit: { requiredCapabilities: ['stable-core'], immunePlane: true },
  host: { identity: 'persistent', coreProtected: true },
  admission: { requireContract: true, requireEvidence: true, trialRequired: true },
  resources: { reserveForCore: true, allocationMode: 'contract-bounded' },
  immune: { mode: 'strict', rejectUnverified: true },
  transmission: { core: 'VERTICAL_REQUIRED', peripheral: 'REACQUIRE_EACH_GENERATION' },
  succession: { coreReplacementRequiresApproval: true, preserveCoreIdentity: true },
  stopConditions: { closeAfterMission: false, stopWhenHostRetired: true }
});
