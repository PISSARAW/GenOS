'use strict';

const control = require('../../src/services/localRuntimeCooperativeControl');

const lineage = Object.freeze({
  workerId: 'worker-multiphase', missionId: 'mission-multiphase',
  episodeId: 'episode-multiphase', threadId: 'thread-multiphase',
  organizationId: 'org-multiphase', projectId: 'project-multiphase'
});
const state = {
  mission: { ...lineage }, framedPrompt: 'multiphase deterministic prompt',
  generatedCalls: 0, evaluatedCalls: 0, consumedReply: null
};

function send(message) {
  if (process.connected) process.send(message);
}

async function runPipeline(message) {
  try {
    await control.safePoint('prepared');
    let reply = state.resumeCheckpoint?.reply || null;
    if (!reply) {
      state.generatedCalls += 1;
      reply = 'reply-created-after-safe-point';
    }
    state.consumedReply = reply;
    state.evaluatedCalls += 1;
    send({ type: 'fixture-pipeline-complete', callId: message.callId,
      generatedCalls: state.generatedCalls, evaluatedCalls: state.evaluatedCalls,
      consumedReply: state.consumedReply,
      resumeCheckpoint: state.resumeCheckpoint || null });
  } catch (error) {
    send({ type: 'fixture-pipeline-error', callId: message.callId,
      code: error?.code || 'PIPELINE_FAILED' });
  }
}

function receive(message) {
  if (message?.type === 'fixture-bind') {
    control.bind(state);
    return;
  }
  if (message?.type === 'fixture-run-pipeline') void runPipeline(message);
}

process.on('message', receive);
