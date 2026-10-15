'use strict';

const control = require('../../src/services/localRuntimeCooperativeControl');

const lineage = Object.freeze({
  workerId: 'worker-e2e', missionId: 'mission-e2e', episodeId: 'episode-e2e',
  threadId: 'thread-e2e', organizationId: 'org-e2e', projectId: 'project-e2e'
});
const state = {
  mission: { ...lineage },
  framedPrompt: 'deterministic cooperative runtime prompt',
  workUnits: 0
};

function send(message) {
  if (process.connected) process.send(message);
}

function snapshot() {
  return {
    workUnits: state.workUnits,
    resumeCheckpoint: state.resumeCheckpoint || null,
    messageListeners: process.listenerCount('message'),
    disconnectListeners: process.listenerCount('disconnect')
  };
}

async function reachSafePoint(message) {
  try {
    await control.safePoint(message.phase || 'prepared');
    state.workUnits += 1;
    send({ type: 'fixture-safe-point-returned', callId: message.callId, ...snapshot() });
  } catch (error) {
    send({
      type: 'fixture-safe-point-error', callId: message.callId,
      code: error?.code || 'SAFE_POINT_FAILED'
    });
  }
}

function divergentAck(message) {
  send({
    type: 'genos-runtime-control-ack', protocolVersion: 1,
    requestId: `${message.requestId}-stale`, action: message.action,
    lineage: { ...message.lineage }, proven: true, success: true,
    proofCode: 'STALE_FIXTURE_ACK'
  });
}

function fixtureMessage(message) {
  if (message?.type === 'fixture-bind') {
    control.bind(state);
    return;
  }
  if (message?.type === 'genos-runtime-control-request') {
    divergentAck(message);
    return;
  }
  if (message?.type === 'fixture-reach-safe-point') {
    void reachSafePoint(message);
    return;
  }
  if (message?.type === 'fixture-observe') {
    send({ type: 'fixture-observation', callId: message.callId, ...snapshot() });
  }
}

process.on('message', fixtureMessage);
