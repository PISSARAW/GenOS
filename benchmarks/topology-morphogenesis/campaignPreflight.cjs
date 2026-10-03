'use strict';

const DEFAULT_WORKSPACE_HEADROOM = 256 * 1024 * 1024;

function requiredCampaignBytes(workerCount, workspaceHeadroom = DEFAULT_WORKSPACE_HEADROOM) {
  const workers = Number.isSafeInteger(workerCount) && workerCount > 0 ? workerCount : 1;
  const headroom = Number.isSafeInteger(workspaceHeadroom) && workspaceHeadroom > 0
    ? workspaceHeadroom : DEFAULT_WORKSPACE_HEADROOM;
  return (workers + 1) * headroom;
}

function assessCampaignCapacity(availableBytes, workerCount, workspaceHeadroom) {
  const requiredBytes = requiredCampaignBytes(workerCount, workspaceHeadroom);
  const known = Number.isFinite(availableBytes) && availableBytes >= 0;
  return {
    passed: known && availableBytes >= requiredBytes,
    availableBytes: known ? availableBytes : null,
    requiredBytes,
    workerCount,
    reason: !known ? 'disk capacity could not be measured'
      : availableBytes < requiredBytes ? 'insufficient disk headroom for isolated worker workspaces' : null
  };
}

module.exports = { assessCampaignCapacity, requiredCampaignBytes };
