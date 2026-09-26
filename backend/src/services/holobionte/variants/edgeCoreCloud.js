'use strict';

const { createPolicy } = require('./policyFactory');

module.exports = createPolicy({
  name: 'edge-core/cloud-symbionts',
  fit: { localEngine: true },
  host: { identity: 'persistent', preferredEngine: 'local' },
  admission: { requireContract: true, requireEvidence: true, trialRequired: true, minimizeRemoteData: true, redactRemoteInputs: true },
  resources: { reserveForCore: true, allocationMode: 'cloud-burst' },
  immune: { mode: 'strict', rejectUnverified: true },
  transmission: { core: 'VERTICAL_PREFERRED', peripheral: 'NEVER_INHERIT' },
  succession: { requireVerifiedReplacement: true, requireCompatiblePrivacy: true },
  stopConditions: { closeAfterMission: false, stopWhenHostRetired: true },
  placement: { host: 'local', remoteCapabilities: 'proxy-only' }
});