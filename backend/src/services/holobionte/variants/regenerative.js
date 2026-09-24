'use strict';

const { createPolicy } = require('./policyFactory');

module.exports = createPolicy({
  name: 'regenerative',
  fit: { succession: true },
  host: { identity: 'persistent', recoveryMode: 'regenerative' },
  admission: { requireContract: true, requireEvidence: true, trialRequired: true },
  resources: { reserveForCore: true, allocationMode: 'recovery-reserve' },
  immune: { mode: 'adaptive', rejectUnverified: true },
  transmission: { core: 'VERTICAL_PREFERRED', peripheral: 'REACQUIRE_EACH_GENERATION' },
  succession: { enabled: true, requireVerifiedReplacement: true, preserveRecoveryEvidence: true },
  stopConditions: { closeAfterMission: false, stopWhenHostRetired: true }
});
