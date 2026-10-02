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
  const environment = { execute: async () => { executions += 1;
    return { status: 'completed', observedStateRef: 'state://1', evidenceRefs: ['receipt:1'], metrics: { success: 1 } }; } };
  const blocked = await motor.execute({ environmentRef: 'env://1', intent: { intentId: 'delete', action: 'delete', irreversible: true }, environment });
  assert.equal(blocked.status, 'blocked');
  assert.equal(executions, 0);
  const completed = await motor.execute({ environmentRef: 'env://1', intent: { intentId: 'move', action: 'move' }, environment });
  assert.equal(completed.status, 'completed');
  assert.equal(executions, 1);
  await assert.rejects(() => motor.execute({ environmentRef: 'env://1', intent: { intentId: 'move', action: 'move' },
    environment: { execute: async () => ({ status: 'completed', evidenceRefs: [] }) } }), /requires evidence/);
  console.log('Embodied percept binding and motor-outcome adapter checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
