'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config/orchestratorConfig');
const { createIsolatedWorkspace } = require('./agentWorkspaceLifecycleService');

async function create(context, workerId) {
  const source = context.sourceWorkspace;
  const options = workspaceOptions(context);
  try {
    return await createIsolatedWorkspace(source, workerId, options);
  } catch (error) {
    return retryFromConfiguredWorkspace({ error, source, workerId, options });
  }
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

function retryFromConfiguredWorkspace(context) {
  const { error, source, workerId, options } = context;
  const fallback = process.env.GENOS_WORKSPACE_ROOT;
  if (!eligibleFallback(error, fallback, source)) throw error;
  return createIsolatedWorkspace(fallback, workerId, { vfs: options.vfs });
}

function eligibleFallback(error, fallback, source) {
  if (error.code !== 'ENOENT' || !fallback) return false;
  return path.resolve(fallback) !== path.resolve(source) && fs.existsSync(fallback);
}

module.exports = { create };
