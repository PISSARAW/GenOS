'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { BrowserScoutService } = require('../src/services/browserScoutService');
const { BrowserPuppeteerAdapter } = require('../src/services/browserPuppeteerAdapter');

async function run() {
  const restricted = new BrowserPuppeteerAdapter({ artifactsDir: path.resolve(__dirname, '../scratch/restricted') });
  await assert.rejects(restricted._assertPublicHttpUrl('http://127.0.0.1/'), /blocked/);
  await assert.rejects(restricted._assertPublicHttpUrl('file:///etc/passwd'), /HTTP\(S\)/);
  const server = http.createServer((req, res) => {
    const page = req.url === '/next'
      ? '<title>Second page</title><h1>Observed after click</h1>'
      : '<title>First page</title><a id="next" href="/next">Next</a>';
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<html><body>${page}</body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const artifactsDir = path.resolve(__dirname, '../scratch/browser_runtime');
  const browserAdapter = new BrowserPuppeteerAdapter({ artifactsDir, allowedHosts: ['127.0.0.1'] });
  const scout = new BrowserScoutService({ browserAdapter });
  try {
    await scout.openBrowserSession('runtime-test', { launchOptions: { timeout: 8000 } });
    const initial = await scout.navigate('runtime-test', `http://127.0.0.1:${port}/`);
    assert.equal(initial.success, true, JSON.stringify(initial));
    assert.ok(fs.existsSync(initial.screenshotPath), JSON.stringify(initial));
    const link = scout.getSession('runtime-test').axTree.find(node => node.role === 'link');
    const action = await scout.act('runtime-test', { type: 'click', selectorId: link.selectorId });
    assert.equal(action.success, true, JSON.stringify(action));
    assert.equal(action.verified, true);
    assert.equal(action.observation.currentUrl, `http://127.0.0.1:${port}/next`);
    assert.equal(action.observation.title, 'Second page');
    assert.ok(fs.existsSync(action.observation.screenshotPath));
    console.log('Real browser navigation, screenshot, action, and observation passed.');
  } finally {
    scout.closeSession('runtime-test');
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(artifactsDir, { recursive: true, force: true });
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
