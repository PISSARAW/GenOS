'use strict';

const assert = require('node:assert/strict');
const percepts = require('../src/services/perception/embodied/perceptStreamAdapter');
const binding = require('../src/services/perception/embodied/multimodalBindingAdapter');
const motor = require('../src/services/perception/embodied/motorOutcomeAdapter');

async function main() {
  const vision = percepts.normalize({ modality: 'vision', artifactRef: 'artifact://vision/1', entityId: 'door',
    semanticSummary: { open: 0, confidence: 0.9 } });
  const audio = percepts.normalize({ modality: 'audio', artifactRef: 'artifact://audio/1', entityId: 'door',
    semanticSummary: 'door latch sound', uncertainty: 0.2 });
  const linked = binding.bind([vision, audio]);
  assert.equal(linked.modalities.length, 2);
  assert.ok(linked.items.every((item) => item.bindingRef === linked.bindingRef));
  assert.ok(linked.items.every((item) => !Object.hasOwn(item, 'rawPayload')));
  assert.throws(() => percepts.normalize({ modality: 'vision', artifactRef: 'a', entityId: 'x',
    semanticSummary: Buffer.from('raw image') }), /compact summary/);
  let executions = 0;
  const environment = { ownerAgentId: 'agent-A', actuatorId: 'motor-A', toolName: 'move', execute: async () => { executions += 1;
    return { status: 'completed', observedStateRef: 'state://1', evidenceRefs: ['receipt:1'], metrics: { success: 1 } }; } };
  const authority = { assert: async () => true };
  const options = { agentId: 'agent-A', environmentRef: 'env://1', environment, authority };
  const blocked = await motor.execute({ ...options, intent: { intentId: 'delete', action: 'delete', irreversible: true } });
  assert.equal(blocked.status, 'blocked');
  assert.equal(executions, 0);
  const foreign = await motor.execute({ ...options, environment: { ...environment, ownerAgentId: 'agent-B' },
    intent: { intentId: 'foreign', action: 'move' } });
  assert.equal(foreign.reason, 'motor-actuator-owner-mismatch');
  assert.equal(executions, 0);
  const denied = await motor.execute({ ...options, authority: { assert: async () => false },
    intent: { intentId: 'denied', action: 'move' } });
  assert.equal(denied.reason, 'motor-actuator-authority-denied');
  assert.equal(executions, 0);
  const completed = await motor.execute({ ...options, intent: { intentId: 'move', action: 'move' } });
  assert.equal(completed.status, 'completed');
  assert.equal(completed.agentId, 'agent-A');
  assert.equal(completed.actuatorId, 'motor-A');
  assert.equal(executions, 1);
  await assert.rejects(() => motor.execute({ ...options, intent: { intentId: 'move', action: 'move' },
    environment: { ...environment, execute: async () => ({ status: 'completed', evidenceRefs: [] }) } }), /requires evidence/);
  console.log('Embodied percept binding and motor-outcome adapter checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
