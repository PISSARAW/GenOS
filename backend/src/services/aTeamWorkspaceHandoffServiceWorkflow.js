'use strict';

async function importWorkspaceCommit(context) {
try {
    await context.runCommand('git', ['bundle', 'create', context.bundle, 'HEAD'], { cwd: context.source });
    if (!context.fs.existsSync(context.path.join(context.destination, '.git'))) {
      await context.runCommand('git', ['init', '--quiet', '--initial-branch=main'], { cwd: context.destination });
    }
    const targetRoot = await context.runCommand('git', ['rev-parse', '--show-toplevel'], { cwd: context.destination });
    if (context.path.resolve(targetRoot.stdout.trim()) !== context.destination) {
      throw context.Object.assign(new context.Error('Consumer Git root does not match its isolated workspace.'), {
        code: 'ATEAM_HANDOFF_TARGET_INVALID'
      });
    }
    const current = await context.runCommand('git', ['rev-parse', '--verify', 'HEAD'], { cwd: context.destination }).catch(() => null);
    if (current) {
      const status = await context.runCommand('git', ['status', '--porcelain'], { cwd: context.destination });
      if (status.stdout.trim()) {
        throw context.Object.assign(new context.Error('Consumer workspace already has uncommitted work; refusing to replace it with a handoff.'), {
          code: 'ATEAM_HANDOFF_TARGET_DIRTY'
        });
      }
    }
    await context.runCommand('git', ['fetch', '--quiet', context.bundle, context.fullCommit], { cwd: context.destination });
    await context.runCommand('git', ['checkout', '--quiet', '--force', '--detach', 'FETCH_HEAD'], { cwd: context.destination });
    const head = await context.runCommand('git', ['rev-parse', 'HEAD'], { cwd: context.destination });
    if (head.stdout.trim().toLowerCase() !== context.fullCommit) {
      throw context.Object.assign(new context.Error('Consumer workspace did not check out the exact producer commit.'), {
        code: 'ATEAM_HANDOFF_COMMIT_MISMATCH'
      });
    }
    return { value: ( { commit: context.fullCommit, sourceWorkspace: context.source, consumerWorkspace: context.destination }) };
  } finally {
    await context.fsPromises.rm(context.bundle, { force: true }).catch(() => context.undefined);
  }
}

module.exports = { importWorkspaceCommit };
