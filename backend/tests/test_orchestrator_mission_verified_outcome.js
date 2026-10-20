'use strict';

const assert = require('node:assert/strict');
const { verifiedMissionOutcome } = require('../bin/orchestratorMissionHelpersBuildContext.cjs');

assert.equal(verifiedMissionOutcome({ success: false }, { missionOutcome: true }, true), true);
assert.equal(verifiedMissionOutcome({ success: true }, { missionOutcome: false }, true), true);
assert.equal(verifiedMissionOutcome({ success: false }, { missionOutcome: false }, true), false);
assert.equal(verifiedMissionOutcome({ success: true }, { missionOutcome: true }, false), false);
console.log('Verified topology closure can establish the root mission outcome.');
