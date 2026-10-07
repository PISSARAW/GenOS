/**
 * GenOS Agent Capsule Path Gate (N5)
 * All filesystem and spawn inputs for capsule provisioning go through here.
 * - agentId values are strictly validated (no `..`, no separators, no
 *   absolute paths) by assertSafeAgentId.
 * - Every derived path is verified to stay inside the capsule root
 *   (containment) before mkdir / rm / spawn ever see it.
 * - context.executable is either a bare binary name (resolved via PATH by
 *   spawn, no shell) or an existing absolute path without `..` segments.
 */

const fs = require('fs');
const path = require('path');
const { chooseRuntimeRoot } = require('./agentWorkspaceLifecycle/placement');

const SAFE_AGENT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function assertSafeAgentId(agentId) {
  const id = String(agentId || '');
  if (!SAFE_AGENT_ID.test(id)) {
    throw Object.assign(new Error(`Invalid agentId for capsule paths: ${id.slice(0, 64)}`), { code: 'CAPSULE_AGENT_ID_INVALID' });
  }
  return id;
}

function assertContained(candidate, base, what) {
  const resolvedBase = path.resolve(base);
  const resolved = path.resolve(candidate);
  if (resolved === resolvedBase) return resolved;
  if (resolved.startsWith(resolvedBase + path.sep)) return resolved;
  throw Object.assign(new Error(`Capsule ${what} escapes the capsule root.`), { code: 'CAPSULE_PATH_ESCAPE' });
}

function capsuleBaseDir(context) {
  if (context.capsuleRoot) return context.capsuleRoot;
  if (process.env.GENOS_CAPSULE_ROOT) return path.resolve(process.env.GENOS_CAPSULE_ROOT);
  return chooseRuntimeRoot();
}

function resolveCapsulePaths(context) {
  const ctx = context || {};
  const agentId = assertSafeAgentId(ctx.agentId);
  const capsuleRoot = capsuleBaseDir(ctx);
  const base = assertContained(path.join(capsuleRoot, '.genos-runtime'), capsuleRoot, 'base');
  const root = assertContained(path.join(base, agentId), base, 'root');
  const bootstrap = assertContained(path.join(root, 'bootstrap', agentId), base, 'bootstrap');
  const genomePath = assertContained(path.join(bootstrap, 'genome.json'), base, 'genome');
  const snapshotPath = assertContained(path.join(bootstrap, 'snapshot.json'), base, 'snapshot');
  return require('./trinityCapsulePaths').resolve(ctx, { capsuleRoot, root, bootstrap, genomePath, snapshotPath, agentId });
}

function assertExistingAbsolute(cmd) {
  if (cmd.includes('..')) {
    throw Object.assign(new Error('Capsule executable must not contain `..`.'), { code: 'CAPSULE_EXECUTABLE_INVALID' });
  }
  if (fs.existsSync(cmd)) return cmd;
  if (process.platform === 'win32' && fs.existsSync(`${cmd}.exe`)) {
    return `${cmd}.exe`;
  }
  throw Object.assign(new Error(`Capsule executable does not exist: ${cmd}`), { code: 'CAPSULE_EXECUTABLE_MISSING' });
}

function resolveExecutable(executable) {
  const cmd = String(executable || '').trim();
  if (!cmd) {
    throw Object.assign(new Error('Capsule executable is required.'), { code: 'CAPSULE_EXECUTABLE_INVALID' });
  }
  if (path.isAbsolute(cmd)) return assertExistingAbsolute(cmd);
  if (cmd.includes('..') || cmd.includes('/') || cmd.includes('\\')) {
    throw Object.assign(new Error('Capsule executable must be a bare binary name or an existing absolute path.'), { code: 'CAPSULE_EXECUTABLE_INVALID' });
  }
  return cmd;
}

module.exports = {
  assertSafeAgentId,
  resolveCapsulePaths,
  resolveExecutable
};
