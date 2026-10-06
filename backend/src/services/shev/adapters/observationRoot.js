'use strict';

const { resolveWorkspaceRoot, resolveContainedPathNoSymlinkSync } = require('../../pathSafety');
const { managedRoot } = require('../../ontogenesis/worktreeService');

function observationRoot(project, target = 'project') {
  if (target === 'project') return resolveWorkspaceRoot(project.root_path);
  if (target !== 'integration') throw new Error('SHEV observation target is invalid.');
  return resolveWorkspaceRoot(resolveContainedPathNoSymlinkSync(managedRoot(project), 'integration'));
}

module.exports = { observationRoot };
