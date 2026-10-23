'use strict';

const localCodeWorker = require('./localCodeWorkerService');

async function resolveProposal(ctx) {
  if (!ctx.codeWorker) return null;
  return localCodeWorker.executeProposal({ workspaceRoot: ctx.workspaceRoot, text: ctx.text,
    allowedCommands: ctx.allowedCommands, requiredPatchPaths: ctx.requiredPatchPaths,
    requiredPatchMarkers: ctx.requiredPatchMarkers,
    requiredPatchMinimumBytes: ctx.requiredPatchMinimumBytes, db: ctx.db,
    mission: ctx.mission, executionRun: ctx.executionRun });
}

module.exports = { resolveProposal };
