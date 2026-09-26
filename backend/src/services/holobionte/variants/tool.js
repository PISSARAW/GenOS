'use strict';

const { createPolicy } = require('./policyFactory');

module.exports = createPolicy({
  name: 'tool',
  fit: { immunePlane: true, requiredCapabilities: ['tool-sandbox'] },
  host: { identity: 'persistent', executionStyle: 'tool-specialist' },
  admission: { requireContract: true, requireEvidence: true, trialRequired: true },
  resources: { reserveForCore: true, allocationMode: 'bounded' },
  immune: { mode: 'strict', rejectUnverified: true },
  transmission: { core: 'VERTICAL_PREFERRED', peripheral: 'NEVER_INHERIT' },
  succession: { requireVerifiedReplacement: true },
  stopConditions: { closeAfterMission: true, stopWhenHostRetired: true },
  tool: { requireManifest: true, sandbox: 'contract-bound', validateSchema: true }
});