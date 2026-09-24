'use strict';

const { createPolicy } = require('./policyFactory');

module.exports = createPolicy({
  name: 'local-first',
  fit: { localEngine: true },
  host: { identity: 'persistent', preferredEngine: 'local' },
  admission: { requireContract: true, requireEvidence: true, trialRequired: true, dataAccess: 'minimum' },
  resources: { reserveForCore: true, allocationMode: 'local-budget-first' },
  immune: { mode: 'strict', rejectUnverified: true },
  transmission: { core: 'VERTICAL_PREFERRED', peripheral: 'REACQUIRE_EACH_GENERATION' },
  succession: { requireCompatiblePrivacy: true, requireVerifiedReplacement: true },
  stopConditions: { closeAfterMission: false, stopWhenHostRetired: true }
});
