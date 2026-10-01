'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { forageStep } = require('../src/services/foragingLoopService');
const { defaultBrowserScout: scout } = require('../src/services/browserScoutService');
const { defaultForaging } = require('../src/services/foragingScoutHarvesterService');
const { runImageTask } = require('../src/services/foragingImageTask');
const { withDeadline } = require('../src/services/operationDeadline');

async function navigationExpires() {
  const server = http.createServer(() => {});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const id = 'global-deadline-browser';
  const prior = defaultForaging.envMeanReturnRate;
  scout.browserAdapter.allowedHosts.add('127.0.0.1');
  try {
    await scout.openBrowserSession(id, { launchOptions: { args: ['--no-sandbox', '--disable-gpu'] } });
    defaultForaging.envMeanReturnRate = 2;
    scout.getSession(id).patchInfoHistory = [{ infoGain: 0.01 }, { infoGain: 0.01 }];
    const started = Date.now();
    await assert.rejects(forageStep({ sessionId: id, nextUrl: `http://127.0.0.1:${server.address().port}/`, elapsedTimeSec: 10, timeoutMs: 80 }), { code: 'OPERATION_TIMEOUT' });
    assert.ok(Date.now() - started < 2000, 'global deadline must precede the 30s navigation timeout');
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(scout.getSession(id).browserPage.isClosed(), true, 'expired navigation page is closed');
    assert.equal(scout.getSession(id).currentUrl, null, 'late navigation cannot publish an observation');
  } finally {
    defaultForaging.envMeanReturnRate = prior;
    scout.browserAdapter.allowedHosts.delete('127.0.0.1');
    await scout.closeSession(id);
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

async function imageExpires() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-image-deadline-'));
  const workerPath = path.join(dir, 'slow.cjs');
  const marker = path.join(dir, 'late-artifact');
  await fs.writeFile(workerPath, `const {workerData}=require('node:worker_threads');setTimeout(()=>require('node:fs').writeFileSync(workerData.marker,'late'),300);`);
  try {
    await assert.rejects(withDeadline({ timeoutMs: 60 }, signal => runImageTask({ signal, workerPath, data: { marker } })), { code: 'OPERATION_TIMEOUT' });
    await new Promise(resolve => setTimeout(resolve, 400));
    await assert.rejects(fs.access(marker), { code: 'ENOENT' });
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}
(async () => {
  await navigationExpires();
  await imageExpires();
  console.log('Foraging global deadline cancels browser and image work: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
