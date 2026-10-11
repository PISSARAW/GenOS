'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { snapshotRoot } = require('../src/services/workspaceSnapshotPaths');

const oldSnapshot = process.env.GENOS_SNAPSHOT_ROOT;
const oldWorkspaces = process.env.GENOS_WORKSPACES_ROOT;
try {
  delete process.env.GENOS_SNAPSHOT_ROOT;
  process.env.GENOS_WORKSPACES_ROOT = path.resolve('D:/GenOS-attention-tests');
  const workspace = path.join(process.env.GENOS_WORKSPACES_ROOT, 'w'.repeat(180));
  const selected = snapshotRoot(workspace, 'worker-long-path');
  if (process.platform === 'win32') {
    assert.ok(selected.startsWith(path.join(process.env.GENOS_WORKSPACES_ROOT, '.genos-snapshots')));
    assert.ok(selected.length <= 170);
    delete process.env.GENOS_WORKSPACES_ROOT;
    assert.throws(() => snapshotRoot(workspace, 'worker-long-path'), { code: 'SNAPSHOT_PATH_TOO_LONG' });
  } else {
    assert.equal(selected, path.resolve(workspace, '.genos', 'workspace-snapshots'));
  }
  console.log('Long snapshot paths have a bounded storage root.');
} finally {
  if (oldSnapshot === undefined) delete process.env.GENOS_SNAPSHOT_ROOT;
  else process.env.GENOS_SNAPSHOT_ROOT = oldSnapshot;
  if (oldWorkspaces === undefined) delete process.env.GENOS_WORKSPACES_ROOT;
  else process.env.GENOS_WORKSPACES_ROOT = oldWorkspaces;
}
