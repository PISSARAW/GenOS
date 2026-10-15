'use strict';

const { activeProcesses } = require('./agentOrchestrationState');
const cooperative = require('./cooperativeRuntimeControl');

function failure(code, detail) {
  return { proven: false, code, detail };
}

async function resume(request) {
  const lineage = cooperative.lineage(request);
  const child = activeProcesses.get(lineage.workerId);
  if (!child) return failure('RUNTIME_UNAVAILABLE',
    'No exact live runtime can prove checkpoint resume.');
  if (!cooperative.exactLineage(child.genosControlIdentity, lineage)) {
    return failure('RUNTIME_IDENTITY_UNPROVEN',
      'Live process identity does not match the checkpoint CellThread.');
  }
  const result = await cooperative.request({
    child, action: 'resume_checkpoint', lineage,
    checkpoint: {
      checkpointId: request.checkpointId,
      checkpointHash: request.checkpointHash,
      contextHash: request.contextHash, context: request.context,
      contextSize: request.contextSize, evidenceRefs: request.evidenceRefs
    }
  });
  if (!result.proven) return result;
  return {
    proven: true, proofCode: result.code,
    checkpointId: request.checkpointId, checkpointHash: request.checkpointHash,
    contextHash: request.contextHash,
    missionId: request.missionId, episodeId: request.episodeId,
    threadId: request.threadId, workerId: request.workerId,
    organizationId: request.organizationId, projectId: request.projectId
  };
}

module.exports = { resume };
