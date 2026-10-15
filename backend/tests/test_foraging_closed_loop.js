'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const loop = require('../src/services/foragingLoopService');
const foraging = require('../src/services/mcpBioTools/handlers/optimalForaging');
const { defaultBrowserScout } = require('../src/services/browserScoutService');
const provenance = require('../src/services/foragingSourceAttestation');

async function verifyDepartureNavigates() {
  const step = await loop.forageStep({
    sessionId: 'test-session',
    patchHistory: [{ infoGain: 0.01 }, { infoGain: 0.01 }],
    elapsedTimeSec: 10,
    iteration: 3,
    nextUrl: 'https://example.com/next',
    htmlContent: '<html><body>next patch</body></html>'
  });
  assert.equal(step.decision, 'PATCH_DEPARTURE');
  assert.equal(step.navigated, true);
  assert.ok(step.navigation, 'departure must carry the navigation receipt');
  assert.equal(step.action.executed, true);
  assert.equal(step.action.verified, true);
  assert.equal(step.observationAfter.currentUrl, 'https://example.com/next');
  assert.ok(step.receipt.evidenceRef.startsWith('sha256:'));
}

async function verifyExploitObserves() {
  const step = await loop.forageStep({
    sessionId: 'test-session-exploit',
    patchHistory: [{ infoGain: 5 }, { infoGain: 5 }],
    elapsedTimeSec: 2,
    iteration: 1
  });
  assert.equal(step.decision, 'EXPLOIT_PATCH');
  assert.ok(step.suggestedFovea, 'exploitation must suggest a foveal scan');
}

async function verifyDepartureWithoutUrl() {
  const step = await loop.forageStep({
    sessionId: 'test-session-nourl',
    patchHistory: [{ infoGain: 0.01 }],
    elapsedTimeSec: 10,
    iteration: 1
  });
  assert.equal(step.decision, 'PATCH_DEPARTURE');
  assert.equal(step.navigated, false);
  assert.equal(step.action.status, 'not_executed');
  assert.equal(step.action.verified, false);
}

async function verifyHandlerWiring() {
  const sessionId = 'handler-session';
  const url = 'https://example.com/handler';
  const html = '<html><body>handler patch</body></html>';
  const scope = ['https://example.com'];
  const oldTrust = process.env.GENOS_FORAGING_TRUST_JSON;
  const keys = crypto.generateKeyPairSync('ed25519');
  process.env.GENOS_FORAGING_TRUST_JSON = JSON.stringify({
    'fixture-browser': keys.publicKey.export({ type: 'spki', format: 'pem' })
  });
  try {
    await defaultBrowserScout.navigate(sessionId, url, { htmlContent: html });
    const observation = defaultBrowserScout.snapshotSession(sessionId);
    const attestation = signObservation(keys.privateKey, {
      producer_id: 'fixture-browser', mission_id: 'mission-handler-test', navigation_scope: scope,
      observed_origin: 'https://example.com', observed_path: '/handler',
      observed_text_digest: provenance.sha256(observation.observationText),
      source_payload_digest: provenance.sha256(html)
    });
    const res = await foraging.handleOptimalForaging({
      action: 'forage_step', session_id: sessionId, patch_history: [{ infoGain: 0.01 }],
      elapsed_time_sec: 10, next_url: url, html_content: html, navigation_scope: scope,
      mission_id: 'mission-handler-test', source_attestation: attestation
    });
    assert.equal(res.status, 'completed');
    const step = JSON.parse(res.output);
    assert.equal(step.decision, 'PATCH_DEPARTURE');
    assert.equal(step.navigated, true);
    assert.equal(step.receipt.sourceProvenance.producerId, 'fixture-browser');
  } finally {
    await defaultBrowserScout.closeSession(sessionId);
    if (oldTrust === undefined) delete process.env.GENOS_FORAGING_TRUST_JSON;
    else process.env.GENOS_FORAGING_TRUST_JSON = oldTrust;
  }
}

function signObservation(privateKey, fields) {
  const attestation = { ...fields, source_payload_digest: fields.source_payload_digest, signature: 'pending' };
  const claims = provenance.attestationClaims(attestation);
  attestation.signature = crypto.sign(null, Buffer.from(JSON.stringify(claims)), privateKey).toString('base64');
  return attestation;
}

(async () => {
  await verifyDepartureNavigates();
  await verifyExploitObserves();
  await verifyDepartureWithoutUrl();
  await verifyHandlerWiring();
  console.log('Foraging closed-loop tests passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
