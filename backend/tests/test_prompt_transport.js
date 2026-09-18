const assert = require('node:assert/strict');
const { encodePromptCapsule, decodePromptCapsule } = require('../src/services/promptTransport');
const { encodeMission, decodeMission } = require('../src/services/runtimeProtocol');

const prompt = 'Analyser la synapse Δ et produire une preuve courte.';
const capsule = encodePromptCapsule({ prompt, sourceAgentId: 'orch', recipientAgentId: 'worker' });
const decodedCapsule = decodePromptCapsule(capsule);
assert.equal(decodedCapsule.prompt, prompt);
assert.equal(decodedCapsule.sourceAgentId, 'orch');
assert.equal(decodedCapsule.recipientAgentId, 'worker');

const frame = encodeMission({ agentId: 'worker', orchestratorAgentId: 'orch', prompt });
const decodedMission = decodeMission(frame);
assert.equal(decodedMission.prompt, prompt);
assert.ok(decodedMission.promptCapsule.length > 0);
console.log('Prompt protobuf/DNA transport round-trip passed.');
