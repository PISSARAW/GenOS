'use strict';

const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { runCommand } = require('./agentWorkspaceLifecycle/git');
const { resolveWorkspaceRoot } = require('./pathSafety');

function commitRefs(handoff) {
  const refs = Array.isArray(handoff?.artifactRefs) ? handoff.artifactRefs : [];
  return refs.map((item) => typeof item === 'string' ? item : item?.uri || item?.ref || '')
    .map((ref) => /^(?:git|commit):([a-f0-9]{7,40})$/i.exec(ref)?.[1] || null).filter(Boolean);
}

function workspacePath(worker, label) {
  if (!worker || worker.workspaceBackend !== 'physical') {
    throw Object.assign(new Error(`${label} must use a physical isolated workspace for Git handoff.`), {
      code: 'ATEAM_HANDOFF_WORKSPACE_UNSUPPORTED'
    });
  }
  return resolveWorkspaceRoot(worker.workspaceRoot, label);
}

function assertSiblingCapsules(source, destination) {
  if (path.dirname(source) !== path.dirname(destination)
    || !/^worker_[a-z0-9_-]+$/i.test(path.basename(source))
    || !/^worker_[a-z0-9_-]+$/i.test(path.basename(destination))
    || source === destination) {
    throw Object.assign(new Error('Git handoff is limited to distinct sibling worker capsules.'), {
      code: 'ATEAM_HANDOFF_SCOPE_INVALID'
    });
  }
}

async function importCommit(source, destination, commit) {
  const sourceRoot = await runCommand('git', ['rev-parse', '--show-toplevel'], { cwd: source });
  if (path.resolve(sourceRoot.stdout.trim()) !== source) {
    throw Object.assign(new Error('Producer Git root does not match its isolated workspace.'), {
      code: 'ATEAM_HANDOFF_SOURCE_INVALID'
    });
  }
  const sourceHead = await runCommand('git', ['rev-parse', 'HEAD'], { cwd: source });
  const fullCommit = sourceHead.stdout.trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(fullCommit) || !fullCommit.startsWith(commit.toLowerCase())) {
    throw Object.assign(new Error('Handoff commit must identify the producer workspace HEAD.'), {
      code: 'ATEAM_HANDOFF_COMMIT_NOT_HEAD'
    });
  }
  await runCommand('git', ['cat-file', '-e', `${fullCommit}^{commit}`], { cwd: source });
  const bundle = path.join(path.dirname(destination), `.handoff-${randomUUID()}.bundle`);
  try {
    await runCommand('git', ['bundle', 'create', bundle, 'HEAD'], { cwd: source });
    if (!fs.existsSync(path.join(destination, '.git'))) {
      await runCommand('git', ['init', '--quiet', '--initial-branch=main'], { cwd: destination });
    }
    const targetRoot = await runCommand('git', ['rev-parse', '--show-toplevel'], { cwd: destination });
    if (path.resolve(targetRoot.stdout.trim()) !== destination) {
      throw Object.assign(new Error('Consumer Git root does not match its isolated workspace.'), {
        code: 'ATEAM_HANDOFF_TARGET_INVALID'
      });
    }
    const current = await runCommand('git', ['rev-parse', '--verify', 'HEAD'], { cwd: destination }).catch(() => null);
    if (current) {
      const status = await runCommand('git', ['status', '--porcelain'], { cwd: destination });
      if (status.stdout.trim()) {
        throw Object.assign(new Error('Consumer workspace already has uncommitted work; refusing to replace it with a handoff.'), {
          code: 'ATEAM_HANDOFF_TARGET_DIRTY'
        });
      }
    }
    await runCommand('git', ['fetch', '--quiet', bundle, fullCommit], { cwd: destination });
    await runCommand('git', ['checkout', '--quiet', '--force', '--detach', 'FETCH_HEAD'], { cwd: destination });
    const head = await runCommand('git', ['rev-parse', 'HEAD'], { cwd: destination });
    if (head.stdout.trim().toLowerCase() !== fullCommit) {
      throw Object.assign(new Error('Consumer workspace did not check out the exact producer commit.'), {
        code: 'ATEAM_HANDOFF_COMMIT_MISMATCH'
      });
    }
    return { commit: fullCommit, sourceWorkspace: source, consumerWorkspace: destination };
  } finally {
    await fsPromises.rm(bundle, { force: true }).catch(() => undefined);
  }
}

async function materializeHandoffs({ consumer, handoffs, byWorker }) {
  const refs = (handoffs || []).flatMap((handoff) => commitRefs(handoff)
    .map((commit) => ({ handoff, commit })));
  if (!refs.length) return [];
  if (refs.length !== 1) {
    throw Object.assign(new Error('A consumer with multiple Git handoffs requires an explicit merge stage.'), {
      code: 'ATEAM_HANDOFF_MULTIPLE_COMMITS'
    });
  }
  const { handoff, commit } = refs[0];
  const producerId = handoff?.producer?.agentId;
  const producer = byWorker.get(producerId);
  const source = workspacePath(producer, 'Producer workspace');
  const destination = workspacePath(consumer, 'Consumer workspace');
  assertSiblingCapsules(source, destination);
  return [await importCommit(source, destination, commit)];
}

module.exports = { commitRefs, materializeHandoffs };
