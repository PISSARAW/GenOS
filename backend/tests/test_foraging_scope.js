'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { defaultBrowserScout } = require('../src/services/browserScoutService');
const { handleOptimalForaging } = require('../src/services/mcpBioTools/handlers/optimalForaging');
const sourceAttestation = require('../src/services/foragingSourceAttestation');

async function run() {
  const sessionId = 'foraging-origin-scope-controlled';
  const pageUrl = 'https://fixture.invalid/runbook/start';
  const scope = ['https://fixture.invalid'];
  const outsideUrl = 'https://other.invalid/private';
  const oldTrust = process.env.GENOS_FORAGING_TRUST_JSON;
  const keys = crypto.generateKeyPairSync('ed25519');
  process.env.GENOS_FORAGING_TRUST_JSON = JSON.stringify({ 'fixture-browser': keys.publicKey.export({ type: 'spki', format: 'pem' }) });
  const originalNavigate = defaultBrowserScout.navigate.bind(defaultBrowserScout);
  let navigationCalls = 0;
  try {
    await defaultBrowserScout.navigate(sessionId, pageUrl, {
      htmlContent: '<html><body><h1>Observed local fixture</h1></body></html>'
    });
    defaultBrowserScout.navigate = async (...args) => {
      navigationCalls += 1;
      return originalNavigate(...args);
    };
    const observation = defaultBrowserScout.snapshotSession(sessionId);
    const attestation = signObservation(keys.privateKey, {
      producer_id: 'fixture-browser', mission_id: 'mission-scope-fixture',
      navigation_scope: scope, observed_origin: 'https://fixture.invalid',
      observed_path: '/runbook/start',
      observed_text_digest: sourceAttestation.sha256(observation.observationText), source_payload_digest: null
    });
    const result = await handleOptimalForaging({
      action: 'forage_step', session_id: sessionId,
      history: [{ infoGain: 0.8 }, { infoGain: 0.1 }, { infoGain: 0.05 }],
      elapsed_time_sec: 4, next_url: outsideUrl, navigation_scope: scope,
      mission_id: 'mission-scope-fixture', source_attestation: attestation
    });
    const step = JSON.parse(result.output);
    assert.equal(result.success, false);
    assert.equal(result.status, 'out_of_scope');
    assert.equal(step.simulated, true, 'a session without Puppeteer must be reported as simulated');
    assert.equal(step.action.status, 'refused');
    assert.equal(step.action.executed, false);
    assert.equal(step.receipt.observedPageScope.origin, scope[0]);
    assert.equal(step.receipt.observedPageScope.pathname, '/runbook/start');
    assert.deepEqual(step.receipt.navigationScope, scope);
    assert.equal(step.receipt.sourceProvenance.producerId, 'fixture-browser');
    assert.equal(step.receipt.sourceProvenance.missionId, 'mission-scope-fixture');
    assert.equal(step.receipt.observedTextDigest,
      `sha256:${crypto.createHash('sha256').update(step.observation.observationText, 'utf8').digest('hex')}`);
    assert.equal(navigationCalls, 0, 'out-of-scope target must be refused before browser navigation');
    console.log('Controlled foraging origin scope refusal and observation provenance: PASS');
  } finally {
    defaultBrowserScout.navigate = originalNavigate;
    await defaultBrowserScout.closeSession(sessionId);
    if (oldTrust === undefined) delete process.env.GENOS_FORAGING_TRUST_JSON;
    else process.env.GENOS_FORAGING_TRUST_JSON = oldTrust;
  }
}

function signObservation(privateKey, fields) {
  const attestation = { ...fields, signature: 'pending' };
  const claims = sourceAttestation.attestationClaims(attestation);
  attestation.signature = crypto.sign(null, Buffer.from(JSON.stringify(claims)), privateKey).toString('base64');
  return attestation;
}

run().catch(error => { console.error(error); process.exitCode = 1; });
