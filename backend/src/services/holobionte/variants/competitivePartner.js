'use strict';

const { createPolicy } = require('./policyFactory');

module.exports = createPolicy({
  name: 'competitive-partner',
  fit: { immunePlane: true, succession: true },
  host: { identity: 'persistent', partnerSelection: 'competitive' },
  admission: { requireContract: true, requireEvidence: true, trialRequired: true },
  resources: { reserveForCore: true, allocationMode: 'contribution-weighted' },
  immune: { mode: 'adaptive', rejectUnverified: true },
  transmission: { core: 'VERTICAL_PREFERRED', peripheral: 'REACQUIRE_EACH_GENERATION' },
  succession: { enabled: true, requireVerifiedReplacement: true, requireVerifiedWinner: true },
  stopConditions: { closeAfterMission: false, stopWhenHostRetired: true },
  competition: { trialMode: 'same-budget', requireVerifiedWinner: true }
});