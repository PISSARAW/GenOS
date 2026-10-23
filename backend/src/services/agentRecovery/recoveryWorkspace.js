'use strict';

const path = require('path');
const { createIsolatedWorkspace } = require('../agentWorkspaceLifecycleService');

function firstTruthy(...values) {
  return values.find(Boolean) || values[values.length - 1];
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

async function createRecoveryWorkspace(source, mission, target) {
  const sourceRoot = firstTruthy(source.workspace_root, mission.workspaceRoot,
    process.env.GENOS_WORKSPACE_ROOT, path.resolve(__dirname, '../../../..'));
  if (mission.missionScope?.trinityExperimentId && source.workspace_root) {
    return { workspaceRoot: source.workspace_root, capsuleName: null, reused: true };
  }
  const capsuleName = `${target.targetId}_${target.decision.action}_${target.report.attempt + 1}`;
  try {
    return await provisionRecoveryWorkspace(sourceRoot, capsuleName, mission.capsuleRoot);
  } catch (error) {
    const fallbackRoot = process.env.GENOS_WORKSPACE_ROOT;
    if (!canRetryFromStableWorkspace(error, sourceRoot, fallbackRoot)) throw error;
    return provisionRecoveryWorkspace(fallbackRoot, capsuleName, mission.capsuleRoot);
  }
}

module.exports = { createRecoveryWorkspace };
