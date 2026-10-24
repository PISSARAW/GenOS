'use strict';

function bindWorkspaceEvidence(mission, workspaceContext) {
  if (!mission.readOnlyWorkspaceEvidence || !workspaceContext) return;
  const readable = Object.entries(workspaceContext.fileHashes || {}).filter(([, hash]) =>
    workspaceContext.text.includes(`| sha256=${hash}]`));
  if (!readable.length) return;
  mission.readFileHashes = Object.fromEntries(readable);
  mission.allowedEvidenceRefs = [...new Set([...(mission.allowedEvidenceRefs || ['mission']),
    ...readable.map(([, hash]) => `sha256:${hash}`)])];
}

function buildReadOnlyWorkspaceContext(mission) {
  if (mission.readOnlyWorkspaceEvidence !== true) return '';
  const context = require('../../bin/localRuntimeWorkspaceContext.cjs')
    .buildWorkspaceContext(mission.workspaceRoot);
  bindWorkspaceEvidence(mission, context);
  return context.text;
}

module.exports = { bindWorkspaceEvidence, buildReadOnlyWorkspaceContext };
