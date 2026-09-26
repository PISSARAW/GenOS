'use strict';

const assert = require('node:assert/strict');
const posture = require('../src/services/cognitivePostureService');
const dispatch = require('../src/services/orchestratorDispatchService');

function verifyDetection() {
  assert.equal(posture.detectPosture('Verify the hypothesis with evidence'), 'require_evidence');
  assert.equal(posture.detectPosture('Deploy the release now'), 'hold_promotion');
  assert.equal(posture.detectPosture('Survey the sector and observe'), 'prefer_observation');
  assert.equal(posture.detectPosture('Run the deterministic migration script'), null);
}

function verifyAttach() {
  const attached = posture.attachPosture({ agentId: 'w-1', prompt: 'Verify the hypothesis' });
  assert.ok(attached.directive.includes('REQUIRE_EVIDENCE'));
  assert.equal(attached.receipt.mode, 'preview');
  assert.equal(attached.receipt.applied, false);
  assert.equal(posture.attachPosture({ agentId: 'w-1', prompt: 'Run the deterministic migration script' }), null);
}

function verifyDispatchCarriesPosture() {
  const mission = dispatch.buildWorkerMission({ agentId: 'w-1', prompt: 'Survey the sector and observe' });
  assert.ok(mission.prompt.includes('PREFER_OBSERVATION'));
  assert.equal(mission.cognitivePosture.effect, 'prefer_observation');
  const plain = dispatch.buildWorkerMission({ agentId: 'w-1', prompt: 'Run the deterministic migration script' });
  assert.equal(plain.cognitivePosture, null);
}

verifyDetection();
verifyAttach();
verifyDispatchCarriesPosture();
console.log('Cognitive posture tests passed.');
