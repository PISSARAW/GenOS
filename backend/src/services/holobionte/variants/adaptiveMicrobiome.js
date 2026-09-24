'use strict';

const { createPolicy } = require('./policyFactory');

module.exports = createPolicy({
  name: 'adaptive-microbiome',
  fit: { requiredCapabilities: ['diversity'], succession: true },
  host: { identity: 'persistent', adaptation: 'bounded' },
  admission: { requireContract: true, requireEvidence: true, trialRequired: true, allowHorizontalAcquisition: true },
  resources: { reserveForCore: true, allocationMode: 'contribution-weighted' },
  immune: { mode: 'adaptive', rejectUnverified: true },
  transmission: { core: 'VERTICAL_PREFERRED', peripheral: 'HORIZONTAL_OK' },
  succession: { enabled: true, requireVerifiedReplacement: true },
  stopConditions: { closeAfterMission: false, stopWhenHostRetired: true }
});
