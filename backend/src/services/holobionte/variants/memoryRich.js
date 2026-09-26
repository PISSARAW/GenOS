'use strict';

const { createPolicy } = require('./policyFactory');

module.exports = createPolicy({
  name: 'memory-rich',
  fit: { localEngine: true },
  host: { identity: 'persistent' },
  admission: { requireContract: true, requireEvidence: true, trialRequired: true },
  resources: { reserveForCore: true, allocationMode: 'verified', memoryRetention: 'verified' },
  immune: { mode: 'adaptive', rejectUnverified: true },
  transmission: { core: 'VERTICAL_PREFERRED', peripheral: 'REACQUIRE_EACH_GENERATION' },
  succession: { requireVerifiedReplacement: true, preserveMemoryEvidence: true },
  stopConditions: { closeAfterMission: false, stopWhenHostRetired: true },
  memory: { stores: ['semantic', 'episodic', 'procedural'], requireProvenance: true }
});