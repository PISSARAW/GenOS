const assert = require('assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const snapshots = require('../src/services/workspaceSnapshotStore');

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-snapshot-limit-'));
  const previous = process.env.GENOS_MAX_SNAPSHOT_BYTES;
  try {
    await fs.writeFile(path.join(root, 'large.txt'), '123456');
    process.env.GENOS_MAX_SNAPSHOT_BYTES = '5';
    await assert.rejects(snapshots.collectFiles(root), /Snapshot exceeds the 5-byte limit/);
    console.log('Snapshot size limit passed.');
  } finally {
    if (previous === undefined) delete process.env.GENOS_MAX_SNAPSHOT_BYTES;
    else process.env.GENOS_MAX_SNAPSHOT_BYTES = previous;
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});