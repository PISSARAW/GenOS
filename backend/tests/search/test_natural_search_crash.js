const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { openFixture, runtime } = require('./naturalSearchTestFixture');
const { captureCheckpoint } = require('../../src/services/search/searchRuntimeCheckpoint');
const { SearchPersistence } = require('../../src/services/search/searchPersistenceService');

async function main() {
  const filename = path.join(os.tmpdir(), `ns-crash-${randomUUID()}.db`);
  let db = await openFixture(filename);
  try {
    const initial = await runtime.getOrCreateSearchState('crash', db);
    const expected = captureCheckpoint(initial);
    await runtime.clearSearchState('crash');
    await db.close();
    const worker = spawnSync(process.execPath, [path.join(__dirname, 'naturalSearchCrashWorker.js'), filename], { encoding: 'utf8' });
    assert.equal(worker.status, 17, worker.stderr);
    db = await openFixture(filename);
    const resumed = await runtime.getOrCreateSearchState('crash', db);
    assert.deepEqual(captureCheckpoint(resumed), expected);
    const stale = new SearchPersistence(db);
    await stale.loadRuntimeCheckpoint('crash');
    await runtime.flushSearchState('crash');
    await assert.rejects(stale.saveRuntimeCheckpoint('crash', expected), /Concurrent/);
    assert.deepEqual(await resumed.persistence.loadRuntimeCheckpoint('crash'), expected);
  } finally {
    await runtime.clearSearchState('crash');
    await db.close();
    fs.rmSync(filename, { force: true });
  }
}
main().then(() => console.log('Natural Search forced process exit and stale writer rejection passed.'))
  .catch(error => { console.error(error); process.exitCode = 1; });
