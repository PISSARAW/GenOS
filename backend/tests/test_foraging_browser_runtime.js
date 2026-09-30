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
      ? '<title>Recovery note</title><h1>Rollback token: ORCHID19</h1>'
      : '<title>Release note</title><h1>Runbook action: KESTREL42</h1><a href="/next">Recovery note</a>';
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<html><body>${page}</body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const sessionId = 'foraging-browser-runtime';
  const adapter = defaultBrowserScout.browserAdapter;
  adapter.allowedHosts.add('127.0.0.1');
  const priorThreshold = defaultForaging.envMeanReturnRate;
  const taskAnswers = ['KESTREL42', 'ORCHID19'];
  const foundAnswers = new Set();
  try {
    await defaultBrowserScout.openBrowserSession(sessionId, {
      launchOptions: { args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-extensions', '--no-zygote', '--no-proxy-server'] }
    });
    await defaultBrowserScout.navigate(sessionId, `http://127.0.0.1:${port}/`);
    const exploit = await forageStep({ sessionId, elapsedTimeSec: 1, iteration: 1 });
    assert.equal(exploit.decision, 'EXPLOIT_PATCH');
    assert.ok(exploit.fovealArtifact && fs.existsSync(exploit.fovealArtifact.outputPath));
    for (const answer of taskAnswers) {
      if (exploit.observation.observationText.includes(answer.toLowerCase())) foundAnswers.add(answer);
    }
    assert.ok(foundAnswers.has('KESTREL42'), 'the observed release page must contain its task answer');

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
    for (const answer of taskAnswers) {
      if (departure.observationAfter.observationText.includes(answer.toLowerCase())) foundAnswers.add(answer);
    }
    assert.deepEqual([...foundAnswers].sort(), [...taskAnswers].sort(), 'the linked-page web task must produce both expected answers');
    console.log(JSON.stringify({ benchmark: 'web-foraging-linked-runbook-facts/v1', tasks: taskAnswers, found: [...foundAnswers].sort(), score: foundAnswers.size / taskAnswers.length, navigation: departure.action.verified }));
  } finally {
    defaultForaging.envMeanReturnRate = priorThreshold;
    adapter.allowedHosts.delete('127.0.0.1');
    await defaultBrowserScout.closeSession(sessionId);
    await new Promise(resolve => server.close(resolve));
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
