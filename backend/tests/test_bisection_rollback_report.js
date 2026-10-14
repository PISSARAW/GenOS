const assert = require('assert');
const path = require('path');
const storePath = require.resolve('../src/services/workspaceSnapshotStore');
const remediation = require('../src/services/bisectionRemediation');

async function run() {
  const previousStore = require.cache[storePath];
  require.cache[storePath] = {
    id: storePath,
    filename: storePath,
    loaded: true,
    exports: {
      preview: async () => ({
        affectedFiles: ['src/parser.js', 'src/parallel-worker.js'],
        targetSnapshot: { file_count: 5 },
        affectedFilesCount: 2
      }),
      restore: async () => ({
        restoredSnapshot: { snapshot_hash: 'healthy-hash' },
        safetySnapshot: { id: 'safety-snapshot' }
      })
    }
  };

  try {
    const report = await remediation.remediateRollback(
      { get: async () => ({ id: 'workspace-1', path: 'workspace' }) },
      'workspace-1',
      { stepNumber: 8, lastHealthy: { snapshotHash: 'healthy-hash', stepNumber: 7 }, targetFile: 'src/parser.js' }
    );
    assert.strictEqual(report.remediationPatch.patchType, 'WHOLE_WORKSPACE_SNAPSHOT_RESTORE');
    assert.deepStrictEqual(report.remediationPatch.restoredFiles, ['src/parser.js', 'src/parallel-worker.js']);
    assert.strictEqual(Object.hasOwn(report.remediationPatch, 'preservedAgentFiles'), false);
    console.log('Bisection rollback report tests passed.');
  } finally {
    if (previousStore) require.cache[storePath] = previousStore;
    else delete require.cache[storePath];
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
