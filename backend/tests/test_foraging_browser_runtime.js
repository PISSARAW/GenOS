'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const { defaultBrowserScout } = require('../src/services/browserScoutService');
const { defaultForaging } = require('../src/services/foragingScoutHarvesterService');
const { forageStep } = require('../src/services/foragingLoopService');

async function run() {
  const server = http.createServer((req, res) => {
    const page = req.url === '/next'
      ? '<title>Next patch</title><h1>New patch observed</h1>'
      : '<title>Rich patch</title><h1>Alpha beta gamma delta epsilon zeta eta theta</h1><a href="/next">Next patch</a>';
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<html><body>${page}</body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const sessionId = 'foraging-browser-runtime';
  const adapter = defaultBrowserScout.browserAdapter;
  adapter.allowedHosts.add('127.0.0.1');
  const priorThreshold = defaultForaging.envMeanReturnRate;
  try {
    await defaultBrowserScout.openBrowserSession(sessionId);
    await defaultBrowserScout.navigate(sessionId, `http://127.0.0.1:${port}/`);
    const exploit = await forageStep({ sessionId, elapsedTimeSec: 1, iteration: 1 });
    assert.equal(exploit.decision, 'EXPLOIT_PATCH');
    assert.ok(exploit.fovealArtifact && fs.existsSync(exploit.fovealArtifact.outputPath));

    defaultForaging.envMeanReturnRate = 2;
    const departure = await forageStep({ sessionId, elapsedTimeSec: 1, iteration: 2 });
    assert.equal(departure.decision, 'PATCH_DEPARTURE');
    assert.equal(departure.action.verified, true);
    assert.equal(departure.observationAfter.currentUrl, `http://127.0.0.1:${port}/next`);
    const expectedEvidence = ['new', 'patch', 'observed'];
    const observed = new Set(departure.observationAfter.observationText.split(/\s+/));
    const evidenceCoverage = expectedEvidence.filter((term) => observed.has(term)).length / expectedEvidence.length;
    assert.equal(evidenceCoverage, 1, 'controlled task evidence must be present in the next observation');
    assert.ok(departure.receipt.evidenceRef.startsWith('sha256:'));
    console.log(`Controlled foraging task: expected-term coverage ${evidenceCoverage.toFixed(2)} (${expectedEvidence.length} terms); browser observation, crop, decision, and navigation passed.`);
  } finally {
    defaultForaging.envMeanReturnRate = priorThreshold;
    adapter.allowedHosts.delete('127.0.0.1');
    await defaultBrowserScout.closeSession(sessionId);
    await new Promise(resolve => server.close(resolve));
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
