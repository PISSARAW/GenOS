'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { WebAuditSensors } = require('../src/services/webAuditSensors');

async function main() {
  const server = http.createServer((request, response) => {
    const field = request.url === '/bad'
      ? '<input id="name"><button>Envoyer</button>'
      : '<label>Nom <input id="name"></label><button>Envoyer</button>';
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<html lang="fr"><head><title>Formulaire</title>
      <meta name="viewport" content="width=device-width,initial-scale=1"></head>
      <body><main><h1>Formulaire</h1>${field}</main></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const chromePath = process.env.GENOS_BROWSER_EXECUTABLE_PATH
    || await require('puppeteer').executablePath();
  const sensors = new WebAuditSensors({ allowedHosts: ['127.0.0.1'], chromePath });
  try {
    const bad = await sensors.axe(`${base}/bad`, 0);
    assert.equal(bad.result, 'regressed', JSON.stringify(bad));
    assert.ok(bad.violations.some(item => item.id === 'label'));
    const good = await sensors.axe(`${base}/good`, 0);
    assert.equal(good.result, 'confirmed', JSON.stringify(good));
    const lighthouse = await sensors.lighthouseAudit(`${base}/good`, { seo: 0 });
    assert.equal(lighthouse.result, 'confirmed', JSON.stringify(lighthouse));
    assert.ok(Number.isFinite(lighthouse.scores.seo));
    const fakeChrome = { port: 1, kill: async () => {} };
    const lowScore = new WebAuditSensors({ allowedHosts: ['127.0.0.1'],
      chromeLauncher: { launch: async () => fakeChrome },
      lighthouse: async () => async () => ({ lhr: { finalDisplayedUrl: `${base}/good`,
        lighthouseVersion: 'fixture', categories: { seo: { score: 0.4 } } } }) });
    assert.equal((await lowScore.lighthouseAudit(`${base}/good`, { seo: 0.7 })).result, 'regressed');
    const missingScore = new WebAuditSensors({ allowedHosts: ['127.0.0.1'],
      chromeLauncher: { launch: async () => fakeChrome },
      lighthouse: async () => async () => ({ lhr: { finalDisplayedUrl: `${base}/good`,
        lighthouseVersion: 'fixture', categories: {} } }) });
    assert.equal((await missingScore.lighthouseAudit(`${base}/good`, { seo: 0.7 })).result, 'inconclusive');
    await assert.rejects(sensors.axe('http://127.0.0.2/', 0), /allowlisted/);
    console.log('Real axe-core and Lighthouse browser audits passed.');
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
