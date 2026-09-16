const assert = require('node:assert/strict');
const biologicalMode = require('../src/services/biologicalModeService');

const bridge = biologicalMode.runtimeBridgeContract();
assert.equal(bridge.controlPlane, 'backend-node');
assert.equal(bridge.biomimeticKernel, 'crates/genos-orchestrator');
assert.equal(bridge.rustGuaranteesImported, false);
assert.match(bridge.evidenceRule, /typed receipt or primitive journal/);

const members = biologicalMode.compose('holobionte', 'Diagnose a runtime boundary');
assert(members.length > 0);
for (const member of members) {
  assert.equal(member.runtimeBridge, bridge);
  assert.equal(member.runtimeBridge.rustGuaranteesImported, false);
}

console.log('Biological runtime bridge contract is explicit on every composed member.');