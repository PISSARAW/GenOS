const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { normalizeRelativePath } = require('../src/services/pathSafety');
const snapshots = require('../src/services/workspaceSnapshotStore');
const workspaceRegistry = require('../src/services/workspaceRegistry');
const specValidator = require('../src/services/specValidator');
const localWorker = require('../src/services/localCodeWorkerService');

async function main() {
  for (const value of ['../outside', 'C:secret', 'C:/secret', '\\\\server\\share\\x']) {
    assert.throws(() => normalizeRelativePath(value), /relative|unsafe/i);
    assert.equal(localWorker.safePath(value), false);
  }

  assert.equal(specValidator.validateSpec('snapshot.schema.json', {}).available, true);
  assert.throws(() => specValidator.validateSpec('../../outside.schema.json', {}), /schema name/i);

  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-traversal-root-'));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-traversal-outside-'));
  const payload = path.join(root, 'payload');
  const destination = path.join(root, 'destination');
  try {
    await fs.mkdir(path.join(payload, 'files'), { recursive: true });
    const content = Buffer.from('safe');
    const files = [{ path: 'link/safe.txt', hash: crypto.createHash('sha256').update(content).digest('hex'), size: content.length, mode: 0o644 }];
    const hash = crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex');
    const manifestDir = path.join(root, hash);
    await fs.mkdir(path.join(manifestDir, 'files'), { recursive: true });
    await fs.mkdir(path.join(manifestDir, 'files', 'link'), { recursive: true });
    await fs.writeFile(path.join(manifestDir, 'files', 'link', 'safe.txt'), content);
    await fs.writeFile(path.join(manifestDir, 'manifest.json'), JSON.stringify({ version: 1, hash, files }));
    await fs.mkdir(destination, { recursive: true });
    await fs.symlink(outside, path.join(destination, 'link'), 'junction');

    await assert.rejects(
      snapshots.materialize({ id: 'traversal', snapshot_hash: hash, metadata: { manifestPath: path.join(manifestDir, 'manifest.json') } }, destination),
      /symbolic link/i
    );
    assert.equal((await fs.readdir(outside)).length, 0);

    await fs.symlink(outside, path.join(root, 'workspace-link'), 'junction');
    assert.equal(workspaceRegistry.isPathWithinRoot(root, path.join(root, 'workspace-link')), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }

  console.log('Path traversal checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
