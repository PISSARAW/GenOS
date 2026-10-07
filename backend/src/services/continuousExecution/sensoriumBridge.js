'use strict';

const sensorium = require('../perception/sensoriumService');
const { makeObservation } = require('../perception/observationService');

function publish(ctx, observations) {
  if (!observations.length) return;
  if (!sensorium.getSensorium(ctx.agentId)) sensorium.createSensorium({ agentId: ctx.agentId });
  for (const receipt of observations) {
    const observation = makeObservation({
      id: receipt.id, sensorId: 'filesystem', agentId: ctx.agentId, target: receipt.target,
      data: { summary: 'A declared plan dependency changed.', digest: receipt.digest,
        evidenceRef: receipt.evidenceRef, executionRunId: receipt.runId, planRevision: receipt.planRevision }
    });
    sensorium.recordObservation({ agentId: ctx.agentId, observation });
    ctx.emitTracked('PERCEPTION_OBSERVED', 'filesystem', observation.data.summary, { observation }, 'info');
  }
}

module.exports = { publish };
