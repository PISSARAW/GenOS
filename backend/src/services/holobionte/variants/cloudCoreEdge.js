'use strict';

const { createPolicy } = require('./policyFactory');

module.exports = createPolicy({
  name: 'cloud-core/edge-symbionts',
  fit: { immunePlane: true },
  host: { identity: 'persistent', preferredEngine: 'cloud' },
  admission: { requireContract: true, requireEvidence: true, trialRequired: true, requireEdgeLease: true, requireProvenance: true },
  resources: { reserveForCore: true, allocationMode: 'edge-bounded' },
  immune: { mode: 'strict', rejectUnverified: true },
  transmission: { core: 'VERTICAL_PREFERRED', peripheral: 'REACQUIRE_EACH_GENERATION' },
  succession: { requireVerifiedReplacement: true },
  stopConditions: { closeAfterMission: false, stopWhenHostRetired: true },
  placement: { host: 'cloud', symbionts: 'edge' }
});