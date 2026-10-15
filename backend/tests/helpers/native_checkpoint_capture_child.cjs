'use strict';

const crypto = require('node:crypto');
const control = require('../../src/services/localRuntimeCooperativeControl');

const lineage = Object.freeze({
  workerId: 'worker-native-capture', missionId: 'mission-native-capture',
  episodeId: 'episode-native-capture', threadId: 'thread-native-capture',
  organizationId: 'org-native-capture', projectId: 'project-native-capture'
});
const prompt = 'native checkpoint capture prompt';
const generated = {
  kind: 'genos-local-runtime', version: 1, phase: 'generated',
  promptHash: crypto.createHash('sha256').update(prompt).digest('hex'),
  reply: 'reply-owned-by-the-runtime'
};
const state = { mission: { ...lineage }, framedPrompt: prompt,
  nativeCheckpoint: { runtimeStateId: 'runtime-state-native-capture', context: generated } };

function send(message) {
  if (process.connected) process.send(message);
}

async function safePoint(message) {
  try {
    await control.safePoint(message.phase || 'generated');
    send({ type: 'fixture-safe-point-returned', callId: message.callId });
  } catch (error) {
    send({ type: 'fixture-safe-point-error', callId: message.callId,
      code: error?.code || 'SAFE_POINT_FAILED' });
  }
}

function receive(message) {
  if (message?.type === 'fixture-bind') {
    if (message.lineage) state.mission = { ...message.lineage };
    if (message.context) state.nativeCheckpoint.context = message.context;
    control.bind(state);
    return;
  }
  if (message?.type === 'fixture-safe-point') void safePoint(message);
  if (message?.type === 'fixture-observe') send({ type: 'fixture-observation',
    callId: message.callId, phase: state.nativeCheckpoint.context.phase });
}

process.on('message', receive);
