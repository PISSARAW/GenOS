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
  stopConditions: { closeAfterMission: false, stopWhenHostRetired: true },
  competition: { trialMode: 'same-budget', diversityProtection: true, superiorityMargin: 0.05, requireApprovalForReplacement: true },
  memory: { stores: ['GRAPH', 'SEMANTIC', 'EPISODIC', 'PROCEDURAL'], forgetBelow: 0.1, automaticForgetting: false },
  synchronization: { cycleInterval: 1, staleState: 'review' }
});
