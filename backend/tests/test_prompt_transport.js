const assert = require('node:assert/strict');
const protobuf = require('protobufjs');
const path = require('node:path');
const { promptToDna, dnaToPrompt, encodePromptCapsule, decodePromptCapsule } = require('../src/services/promptTransport');
const { encodeMission, decodeMission } = require('../src/services/runtimeProtocol');

const prompt = 'Analyser la synapse Δ et produire une preuve courte.';
const capsule = encodePromptCapsule({ prompt, sourceAgentId: 'orch', recipientAgentId: 'worker' });
const decodedCapsule = decodePromptCapsule(capsule);
assert.equal(decodedCapsule.prompt, prompt);
assert.equal(decodedCapsule.sourceAgentId, 'orch');
assert.equal(decodedCapsule.recipientAgentId, 'worker');
assert.ok(capsule.length < promptToDna(prompt).length);

const schema = protobuf.loadSync(path.resolve(__dirname, '../src/proto/synapse.proto'));
const PromptCapsule = schema.lookupType('synapse.PromptCapsule');
const legacy = PromptCapsule.encode(PromptCapsule.create({
  sourceAgentId: 'orch', recipientAgentId: 'worker',
  promptDna: promptToDna(prompt), encoding: 'UTF-8-2BIT-DNA'
})).finish();
assert.equal(decodePromptCapsule(legacy).prompt, prompt);
const invalidUtf8 = PromptCapsule.encode(PromptCapsule.create({
  promptDna: Buffer.from([0xc3, 0x28]), encoding: 'UTF-8'
})).finish();
assert.throws(() => decodePromptCapsule(invalidUtf8), /invalid UTF-8/);
assert.throws(() => dnaToPrompt(Buffer.from('TAATAGGA')), /invalid UTF-8/);

const frame = encodeMission({ agentId: 'worker', orchestratorAgentId: 'orch', prompt });
const decodedMission = decodeMission(frame);
assert.equal(decodedMission.prompt, prompt);
assert.ok(decodedMission.promptCapsule.length > 0);
console.log('Prompt protobuf UTF-8 and legacy DNA round-trip passed.');
