'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { inventory } = require('./workerQualificationInventory.cjs');

function command(root, program, args) {
  try {
    return execFileSync(program, args, { cwd: root, encoding: 'utf8', timeout: 10000,
      windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_) {
    return null;
  }
}

function createManifest(input) {
  const root = path.resolve(input.root);
  const commit = command(root, 'git', ['rev-parse', 'HEAD']);
  const status = command(root, 'git', ['status', '--porcelain', '--untracked-files=normal']);
  const clean = Boolean(commit && status === '');
  return { runId: input.runId, capturedAt: new Date().toISOString(),
    source: { commit, clean, qualificationClass: clean ? 'candidate' : 'exploratory' },
    environment: { node: process.version, platform: process.platform, arch: process.arch,
      rust: command(root, 'rustc', ['--version']),
      lean: process.env.GENOS_COMPLIANCE_LEAN_VERSION || null, model: input.model || null },
    benchmarkDigest: inventory().benchmarkDigest };
}

module.exports = { createManifest };
