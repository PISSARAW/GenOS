'use strict';

const { isPathWithinRoot } = require('../workspaceRegistry');
const fs = require('node:fs');

function resolveSandboxTarget(config, verifier, context = {}) {
  const cwd = config.cwd || verifier.cwd || context.cwd || process.cwd();
  const root = context.allowedWorkspaceRoot || process.cwd();
  if (!isPathWithinRoot(root, cwd)) {
    throw new Error(`AEIS verification workspace is outside the trusted capsule: ${cwd}`);
  }
  return {
    command: config.command || config.buildCommand,
    cwd: fs.realpathSync(cwd),
    timeout: context.timeoutMs || config.timeoutMs || 30000,
  };
}

module.exports = { resolveSandboxTarget };
