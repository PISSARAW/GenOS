'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { runProviderMetapopulation } = require('../src/services/epistemic/epistemicProviderMetapopulation');
const { runPopulation } = require('../src/services/epistemic/processIsolatedMetapopulationRunner');

async function providerFixture(model) {
  const fixture = { model, verdict: 'supports', calls: 0, delay: 0 };
  fixture.server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      fixture.calls += 1;
      const input = JSON.parse(body);
      assert.equal(input.model, model);
      const prompt = input.messages[0].content;
      const claimId = prompt.match(/Claim ID: (.*?)\. Evidence digest:/)[1];
      const evidenceDigest = prompt.match(/Evidence digest: (.*?)\.\nClaim:/)[1];
      const text = JSON.stringify({ claimId, evidenceDigest, verdict: fixture.verdict,
        rationale: 'Controlled HTTP adapter fixture: independently returned bound assessment.' });
      setTimeout(() => {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ choices: [{ message: { content: text } }] }));
      }, fixture.delay);
    });
  });
  await new Promise((resolve) => fixture.server.listen(0, '127.0.0.1', resolve));
  fixture.endpoint = `http://127.0.0.1:${fixture.server.address().port}/v1/chat/completions`;
  return fixture;
}

async function main() {
  const first = await providerFixture('review-a');
  const second = await providerFixture('review-b');
  try {
    const antigen = { id: 'claim-roundtrip', claim: 'echo ok outputs "ok"',
      epitopes: { evidence: { digest: 'sha256:roundtrip' } } };
    const profiles = [
      { provider: 'lmstudio', model: 'lmstudio://review-a', endpoint: first.endpoint },
      { provider: 'ollama', model: 'ollama://review-b', endpoint: second.endpoint },
    ];
    const reviewed = await runProviderMetapopulation(antigen, profiles, { timeoutMs: 60000 });
    assert.equal(reviewed.status, 'complete', JSON.stringify(reviewed.reviews));
    assert.equal(reviewed.verdict, 'supports');
    assert.equal(reviewed.distinctProviders, 2);
    assert.equal(new Set(reviewed.reviews.map((row) => row.processId)).size, 2);
    assert.ok(reviewed.reviews.every((row) => row.processId > 0 && row.processId !== process.pid));
    assert.equal(first.calls, 1);
    assert.equal(second.calls, 1);
    second.verdict = 'refutes';
    const disputed = await runProviderMetapopulation(antigen, profiles, { timeoutMs: 60000 });
    assert.equal(disputed.status, 'disputed', JSON.stringify(disputed.reviews.map((row) => ({ provider: row.provider, status: row.status, error: row.error }))));
    second.delay = 1000;
    await assert.rejects(runPopulation({ ...profiles[1], prompt: 'independent review', timeoutMs: 100 }),
      (error) => error.code === 'AEIS_POPULATION_WORKER_FAILED' || error.code === 'AEIS_POPULATION_TIMEOUT');
    console.log('AEIS real child workers: two HTTP adapters, distinct processes, dispute and timeout: PASS');
  } finally {
    first.server.closeAllConnections();
    second.server.closeAllConnections();
    await Promise.all([first, second].map((fixture) => new Promise((resolve) => fixture.server.close(resolve))));
  }
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { providerFixture };
