'use strict';

const telemetry = require('../telemetryObserver');

function emitCheckpointEvent(event) {
  try {
    telemetry.emitEvent(event);
    return true;
  } catch (error) {
    console.warn('[MissionCheckpointBridge] telemetry failed:', error.message);
    return false;
  }
}

async function evaluateMissionCompletion(input) {
  if (!input?.gateAllowed) return { evaluated: false, reason: 'COMPLETION_NOT_AUTHORIZED' };
  const agentId = input.agentId;
  const missionId = String(input.missionId || '').trim();
  try {
    const receipt = await require('./communicationCheckpointService').evaluateCheckpoint({
      db: input.db, agentId, checkpoint: 'MISSION_COMPLETED',
      evidence: { domain: 'mission', semanticRefs: missionId ? [`mission:${missionId}:completed`] : [] }
    });
    const telemetryRecorded = emitCheckpointEvent({ eventType: 'COMMUNICATION_CHECKPOINT_EVALUATED', agentId,
      action: receipt.decision?.action || 'UNKNOWN',
      detail: 'Mission completion communication policy evaluated.',
      payload: { checkpoint: 'MISSION_COMPLETED', decision: receipt.decision,
        executed: receipt.executed }, severity: 'info' });
    return { evaluated: true, receipt, telemetryRecorded };
  } catch (error) {
    const telemetryRecorded = emitCheckpointEvent({ eventType: 'COMMUNICATION_CHECKPOINT_FAILED', agentId,
      action: 'EVALUATE', detail: 'Mission completion communication policy failed.',
      payload: { checkpoint: 'MISSION_COMPLETED', error: error.message }, severity: 'warning' });
    return { evaluated: false, reason: 'CHECKPOINT_FAILED', error: error.message, telemetryRecorded };
  }
}

module.exports = { evaluateMissionCompletion };
