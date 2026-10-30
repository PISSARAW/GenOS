'use strict';

const path = require('path');
const config = require('../config/orchestratorConfig');
const { createIsolatedWorkspace } = require('./agentWorkspaceLifecycleService');

async function create(context, workerId) {
  if (gqwfEligible(context)) {
    const descriptor = await require('./gqwf/workers').materializeWorker(context.db, {
      workerId,
      workspaceId: context.parent.workspace_id,
      sourcePath: context.sourceWorkspace
    });
    context.gqwfWorkerWorkspace = descriptor;
    return descriptor.path;
  }
  const source = context.sourceWorkspace;
  const options = workspaceOptions(context);
  return createIsolatedWorkspace(source, workerId, options);
}

function gqwfEligible(context) {
  const { mission, assignment } = context;
  if (mission.executionPolicy?.gqwfV2 !== true) return false;
  if (config.inProcessWorkers() || (context.assignments || []).length > 12) return false;
  if (mission.localRuntime === true || ['local'].includes(String(mission.executor || mission.runtime || '').toLowerCase())) return false;
  return !require('./agents/workerRuntimeLimitsService').isDeterministicWorkerMission({
    ...mission,
    workerKind: assignment.workerKind,
    methodContract: assignment.methodContract
  });
}

function workspaceOptions(context) {
  const { assignment, mission } = context;
  const vfsWorker = !/coder|developer|implementation/i.test(assignment.role || '');
  const manyAssignments = (context.assignments || []).length > 12;
  const allowEdits = mission.executionPolicy?.allowFileEdits === true || config.allowFileEdits();
  return {
    capsuleRoot: mission.capsuleRoot,
    vfs: !allowEdits || mission.vfsWorkspace === true || (manyAssignments && vfsWorker)
  };
}

function samePath(firstPath, secondPath) {
  if (!firstPath || !secondPath) return false;
  const first = path.resolve(firstPath);
  const second = path.resolve(secondPath);
  return process.platform === 'win32' ? first.toLowerCase() === second.toLowerCase() : first === second;
}

function sourceWorkspace(parent, mission) {
  const gqwfParentView = mission.executionWorkspace?.backend === 'gqwf'
    && mission.executionWorkspace.path && samePath(mission.workspaceRoot, mission.executionWorkspace.path);
  if (parent.workspace_path && mission.workspaceRoot && mission.workspaceProvisioned === true
    && !gqwfParentView && !samePath(mission.workspaceRoot, parent.workspace_path)) {
    throw Object.assign(new Error(`Mission workspace root does not match workspace '${parent.workspace_id}'.`), {
      code: 'WORKSPACE_ROOT_MISMATCH'
    });
  }
  return gqwfParentView ? mission.workspaceRoot : (parent.workspace_path || mission.workspaceRoot);
}

module.exports = { create, sourceWorkspace };
