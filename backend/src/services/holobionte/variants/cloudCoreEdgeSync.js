'use strict';

const { createPolicy } = require('./policyFactory');

module.exports = createPolicy({
  name: 'cloud-core/edge-sync',
  fit: { immunePlane: true },
  host: { identity: 'persistent', preferredEngine: 'cloud' },
  admission: { requireContract: true, requireEvidence: true, trialRequired: true, requireProvenance: true },
  resources: { reserveForCore: true, allocationMode: 'verified', synchronization: 'verified-edge-state' },
  immune: { mode: 'strict', rejectUnverified: true },
  transmission: { core: 'VERTICAL_PREFERRED', peripheral: 'REACQUIRE_EACH_GENERATION' },
  succession: { requireVerifiedReplacement: true },
  stopConditions: { closeAfterMission: false, stopWhenHostRetired: true },
  synchronization: { mode: 'asynchronous', requireProvenance: true, staleState: 'reject' }
});