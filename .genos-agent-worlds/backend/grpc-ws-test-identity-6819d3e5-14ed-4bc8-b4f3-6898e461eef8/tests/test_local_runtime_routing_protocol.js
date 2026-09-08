const assert = require('node:assert/strict');
const { encodeMission, decodeMission } = require('../src/services/runtimeProtocol');

const mission = decodeMission(encodeMission({
  agentId: 'local-route-test',
  localModel: 'ollama://selected-model',
  localRoutingPolicyJson: JSON.stringify({ primary: 'ollama://selected-model', fallbacks: ['ollama://backup'] })
}));

assert.equal(mission.localModel, 'ollama://selected-model');
assert.deepEqual(JSON.parse(mission.localRoutingPolicyJson), {
  primary: 'ollama://selected-model', fallbacks: ['ollama://backup']
});
console.log('Local runtime routing fields survive protobuf framing.');