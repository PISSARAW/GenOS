'use strict';

async function importCommitStage1(__genosStageScope1) {
try {
    await (0, __genosStageScope1.runCommand)('git', ['bundle', 'create', __genosStageScope1.bundle, 'HEAD'], { cwd: __genosStageScope1.source });
    if (!__genosStageScope1.fs.existsSync(__genosStageScope1.path.join(__genosStageScope1.destination, '.git'))) {
      await (0, __genosStageScope1.runCommand)('git', ['init', '--quiet', '--initial-branch=main'], { cwd: __genosStageScope1.destination });
    }
    const targetRoot = await (0, __genosStageScope1.runCommand)('git', ['rev-parse', '--show-toplevel'], { cwd: __genosStageScope1.destination });
    if (__genosStageScope1.path.resolve(targetRoot.stdout.trim()) !== __genosStageScope1.destination) {
      throw __genosStageScope1.Object.assign(new __genosStageScope1.Error('Consumer Git root does not match its isolated workspace.'), {
        code: 'ATEAM_HANDOFF_TARGET_INVALID'
      });
    }
    const current = await (0, __genosStageScope1.runCommand)('git', ['rev-parse', '--verify', 'HEAD'], { cwd: __genosStageScope1.destination }).catch(() => null);
    if (current) {
      const status = await (0, __genosStageScope1.runCommand)('git', ['status', '--porcelain'], { cwd: __genosStageScope1.destination });
      if (status.stdout.trim()) {
        throw __genosStageScope1.Object.assign(new __genosStageScope1.Error('Consumer workspace already has uncommitted work; refusing to replace it with a handoff.'), {
          code: 'ATEAM_HANDOFF_TARGET_DIRTY'
        });
      }
    }
    await (0, __genosStageScope1.runCommand)('git', ['fetch', '--quiet', __genosStageScope1.bundle, __genosStageScope1.fullCommit], { cwd: __genosStageScope1.destination });
    await (0, __genosStageScope1.runCommand)('git', ['checkout', '--quiet', '--force', '--detach', 'FETCH_HEAD'], { cwd: __genosStageScope1.destination });
    const head = await (0, __genosStageScope1.runCommand)('git', ['rev-parse', 'HEAD'], { cwd: __genosStageScope1.destination });
    if (head.stdout.trim().toLowerCase() !== __genosStageScope1.fullCommit) {
      throw __genosStageScope1.Object.assign(new __genosStageScope1.Error('Consumer workspace did not check out the exact producer commit.'), {
        code: 'ATEAM_HANDOFF_COMMIT_MISMATCH'
      });
    }
    return { value: ( { commit: __genosStageScope1.fullCommit, sourceWorkspace: __genosStageScope1.source, consumerWorkspace: __genosStageScope1.destination }) };
  } finally {
    await __genosStageScope1.fsPromises.rm(__genosStageScope1.bundle, { force: true }).catch(() => __genosStageScope1.undefined);
  }
}

module.exports = { importCommitStage1 };
