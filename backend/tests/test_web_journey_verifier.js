'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { WebJourneyVerifier } = require('../src/services/webJourneyVerifier');
const { handleBrowserScout } = require('../src/services/mcpBioTools/handlers/browserScout');

async function main() {
  let repaired = true;
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    if (request.url.startsWith('/done')) {
      response.end(`<title>Résultat</title><h1>${repaired ? 'Réservation confirmée' : 'Erreur de réservation'}</h1>`);
      return;
    }
    response.end('<title>Accueil</title><form action="/done"><label>Nom <input name="name"></label><button>Réserver</button></form>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-journey-'));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browserPath = process.env.GENOS_BROWSER_EXECUTABLE_PATH
    || await require('puppeteer').executablePath();
  const verifier = new WebJourneyVerifier({ allowedHosts: ['127.0.0.1'], artifactsDir,
    executablePath: browserPath });
  const journey = { url: base, steps: [
    { action: 'fill', role: 'textbox', name: 'Nom', value: 'Ada' },
    { action: 'click', role: 'button', name: 'Réserver' }
  ], assertions: [
    { type: 'url', expected: `${base}/done?name=Ada` },
    { type: 'text', role: 'heading', name: 'Réservation confirmée', expected: 'Réservation confirmée' }
  ] };
  try {
    const passed = await verifier.verify(journey);
    assert.equal(passed.result, 'confirmed', JSON.stringify(passed));
    assert.equal(passed.verified, true);
    assert.equal(passed.checks.length, 2);
    assert.ok(fs.existsSync(passed.receiptPath));
    assert.equal(JSON.parse(fs.readFileSync(passed.receiptPath, 'utf8')).result, 'confirmed');
    const previousHosts = process.env.GENOS_BROWSER_VERIFICATION_HOSTS;
    const previousBrowser = process.env.GENOS_BROWSER_EXECUTABLE_PATH;
    const previousArtifacts = process.env.GENOS_BROWSER_VERIFICATION_ARTIFACTS_DIR;
    try {
      process.env.GENOS_BROWSER_VERIFICATION_HOSTS = '127.0.0.1';
      process.env.GENOS_BROWSER_EXECUTABLE_PATH = browserPath;
      process.env.GENOS_BROWSER_VERIFICATION_ARTIFACTS_DIR = artifactsDir;
      const dispatched = await handleBrowserScout({ action: 'verify_journey', journey });
      assert.equal(dispatched.success, true, dispatched.output);
      assert.equal(JSON.parse(dispatched.output).result, 'confirmed');
    } finally {
      if (previousHosts === undefined) delete process.env.GENOS_BROWSER_VERIFICATION_HOSTS;
      else process.env.GENOS_BROWSER_VERIFICATION_HOSTS = previousHosts;
      if (previousBrowser === undefined) delete process.env.GENOS_BROWSER_EXECUTABLE_PATH;
      else process.env.GENOS_BROWSER_EXECUTABLE_PATH = previousBrowser;
      if (previousArtifacts === undefined) delete process.env.GENOS_BROWSER_VERIFICATION_ARTIFACTS_DIR;
      else process.env.GENOS_BROWSER_VERIFICATION_ARTIFACTS_DIR = previousArtifacts;
    }

    repaired = false;
    const failed = await verifier.verify(journey);
    assert.equal(failed.result, 'regressed', JSON.stringify(failed));
    assert.equal(failed.verified, false);
    assert.equal(failed.checks[1].passed, false);
    assert.ok(fs.existsSync(failed.receiptPath));

    await assert.rejects(verifier.verify({ ...journey, url: 'http://127.0.0.2/' }), /allowlisted/);
    await assert.rejects(verifier.verify({ ...journey, url: 'file:///etc/passwd' }), /allowlisted/);
    await assert.rejects(verifier.verify({ ...journey, assertions: [] }), /bounded/);
    const noBrowser = new WebJourneyVerifier({ allowedHosts: ['127.0.0.1'], artifactsDir,
      playwright: { chromium: { launch: async () => { throw Error('browser missing'); } } } });
    const inconclusive = await noBrowser.verify(journey);
    assert.equal(inconclusive.result, 'inconclusive');
    assert.equal(inconclusive.verified, false);
    assert.match(inconclusive.error, /browser missing/);
    console.log('Playwright journey verification, regression, and fail-closed checks passed.');
  } finally {
    fs.rmSync(artifactsDir, { recursive: true, force: true });
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
