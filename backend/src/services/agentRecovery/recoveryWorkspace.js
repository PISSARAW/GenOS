'use strict';

const path = require('path');
const { createIsolatedWorkspace, cleanupWorkspace, forgetWorkspace, trackWorkspace } = require('../agentWorkspaceLifecycleService');

function firstTruthy(...values) {
  return values.find(Boolean) || values[values.length - 1];
}

function bestEffort(promise) {
  return promise.catch(() => {});
}

function sameWorkspace(left, right) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function canRetryFromStableWorkspace(error, sourceRoot, fallbackRoot) {
  const sourceWasRemoved = error?.code === 'ENOENT' && /scandir|copyfile|lstat/i.test(String(error.message || ''));
  const depthLimit = /workspace copy exceeds the \d+-level depth limit/i.test(String(error?.message || ''));
  return Boolean(fallbackRoot && !sameWorkspace(sourceRoot, fallbackRoot) && (depthLimit || sourceWasRemoved));
}

async function provisionRecoveryWorkspace(sourceRoot, capsuleName, capsuleRoot) {
  const workspaceRoot = await createIsolatedWorkspace(sourceRoot, capsuleName, capsuleRoot);
  return { workspaceRoot, capsuleName };
}

async function createRecoveryWorkspace(db, source, mission, target) {
  if (target.sameIdentity || (mission.missionScope?.trinityExperimentId && source.workspace_root)) {
    return { workspaceRoot: firstTruthy(source.workspace_root, mission.workspaceRoot),
      workspaceId: source.workspace_id || mission.workspaceId || null, reused: true };
  }
  const sourceRoot = firstTruthy(source.workspace_root, mission.workspaceRoot,
    process.env.GENOS_WORKSPACE_ROOT, path.resolve(__dirname, '../../../..'));
  const capsuleName = `${target.targetId}_${target.decision.action}_${target.report.attempt + 1}`;
  try {
    return await bindRecoveryWorkspace(db, target, source,
      await provisionRecoveryWorkspace(sourceRoot, capsuleName, mission.capsuleRoot));
  } catch (error) {
    const fallbackRoot = process.env.GENOS_WORKSPACE_ROOT;
    if (!canRetryFromStableWorkspace(error, sourceRoot, fallbackRoot)) throw error;
    return bindRecoveryWorkspace(db, target, source,
      await provisionRecoveryWorkspace(fallbackRoot, capsuleName, mission.capsuleRoot));
  }
}

async function bindRecoveryWorkspace(db, target, source, workspace) {
  try {
    await trackWorkspace(target.targetId, workspace.workspaceRoot);
    workspace.workspaceId = await require('../workerWorkspaceBindingService').bindWorkerWorkspace(db, {
      workerId: target.targetId, parentId: target.orchestratorId,
      parentWorkspaceId: target.workspaceId || source.parent_workspace_id,
      workspaceRoot: workspace.workspaceRoot
    });
    workspace.created = true;
    return workspace;
  } catch (error) {
    await bestEffort(cleanupWorkspace(workspace.workspaceRoot, target.targetId));
    await bestEffort(forgetWorkspace(target.targetId));
    throw error;
  }
}

module.exports = { createRecoveryWorkspace };
