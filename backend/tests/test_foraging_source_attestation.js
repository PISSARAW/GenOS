'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const database = require('../src/db');
const previousLease = process.env.GENOS_MCP_LEASE;
process.env.GENOS_MCP_LEASE = 'genos_biomimicry_optimal_foraging';
const memberships = new Map([
  ['agent-foraging-1:mission-foraging-1', { organizationId: 'org-foraging', projectId: 'project-foraging' }],
  ['agent-foraging-2:mission-foraging-2', { organizationId: 'org-foraging', projectId: 'project-foraging' }]
]);
database.getDatabase = async () => ({ get: async (_query, ...values) => {
  const [missionId, agentId, orgFirst, orgSecond, projectFirst, projectSecond] = values;
  const membership = memberships.get(`${agentId}:${missionId}`);
  const organizationMatches = !orgFirst || membership?.organizationId === orgSecond;
  const projectMatches = !projectFirst || membership?.projectId === projectSecond;
  return membership && organizationMatches && projectMatches ? { mission_id: missionId } : null;
} });
const { defaultBrowserScout } = require('../src/services/browserScoutService');
const { handleOptimalForaging } = require('../src/services/mcpBioTools/handlers/optimalForaging');
const { executeToolLogic } = require('../src/services/mcpExecutor/transports/toolLogic');
const provenance = require('../src/services/foragingSourceAttestation');

async function run() {
  const sessionId = 'foraging-authenticated-source-fixture';
  const url = 'https://fixture.invalid/observe';
  const html = '<html><body><main>Signed fixture observation</main></body></html>';
  const scope = ['https://fixture.invalid'];
  const keys = crypto.generateKeyPairSync('ed25519');
  const oldTrust = process.env.GENOS_FORAGING_TRUST_JSON;
  process.env.GENOS_FORAGING_TRUST_JSON = JSON.stringify({
    'fixture-producer': keys.publicKey.export({ type: 'spki', format: 'pem' })
  });
  const navigate = defaultBrowserScout.navigate.bind(defaultBrowserScout);
  let navigationCalls = 0;
  try {
    await navigate(sessionId, url, { htmlContent: html });
    const observation = defaultBrowserScout.snapshotSession(sessionId);
    const attestation = signObservation(keys.privateKey, {
      producer_id: 'fixture-producer', mission_id: 'mission-foraging-1',
      navigation_scope: scope, observed_origin: 'https://fixture.invalid', observed_path: '/observe',
      observed_text_digest: provenance.sha256(observation.observationText),
      source_payload_digest: provenance.sha256(html)
    });
    defaultBrowserScout.navigate = async (...args) => {
      navigationCalls += 1;
      return navigate(...args);
    };
    const accepted = await call({ sessionId, url, scope, html, attestation, missionId: 'mission-foraging-1' }, true);
    assert.equal(accepted.success, true, JSON.stringify(accepted));
    const receipt = JSON.parse(accepted.output).receipt;
    assert.equal(receipt.sourceProvenance.producerId, 'fixture-producer');
    assert.equal(receipt.sourceProvenance.missionId, 'mission-foraging-1');
    assert.equal(receipt.sourceProvenance.observedTextDigest, receipt.observedTextDigest);
    assert.match(receipt.evidenceRef, /^sha256:[a-f0-9]{64}$/);

    const beforeRefusal = navigationCalls;
    const unknown = { ...attestation, producer_id: 'unknown-producer' };
    assert.equal((await call({ sessionId, url, scope, html, attestation: unknown, missionId: 'mission-foraging-1' })).status,
      'source_unverified');
    const replay = await call({ sessionId, url, scope, html, attestation, missionId: 'mission-foraging-2' });
    assert.equal(replay.status, 'source_unverified', 'a valid signature for another mission must be refused');
    const foreignCaller = await call({ sessionId, url, scope, html, attestation, missionId: 'mission-foraging-1',
      agentId: 'agent-foraging-2' });
    assert.equal(foreignCaller.status, 'source_unverified',
      'a caller outside the signed mission must be refused even when the attestation itself is valid');
    const foreignTenant = await call({ sessionId, url, scope, html, attestation, missionId: 'mission-foraging-1',
      tenant: { organizationId: 'org-other', projectId: 'project-other' } });
    assert.equal(foreignTenant.status, 'source_unverified',
      'a valid mission membership from another tenant must not authorize navigation');
    const altered = await call({ sessionId, url, scope, html: html.replace('Signed', 'Altered'), attestation,
      missionId: 'mission-foraging-1' });
    assert.equal(altered.status, 'source_unverified', 'payload alteration must be refused before navigation');
    assert.equal(navigationCalls, beforeRefusal,
      'unknown producer, cross-mission replay, foreign caller/tenant, and altered payload must not navigate');

    const wrongText = signObservation(keys.privateKey, {
      producer_id: 'fixture-producer', mission_id: 'mission-foraging-1',
      navigation_scope: scope, observed_origin: 'https://fixture.invalid', observed_path: '/observe',
      observed_text_digest: provenance.sha256('different text'), source_payload_digest: provenance.sha256(html)
    });
    const digestMismatch = await call({ sessionId, url, scope, html, attestation: wrongText, missionId: 'mission-foraging-1' });
    assert.equal(digestMismatch.status, 'source_unverified', 'observed text digest mismatch must be refused');
    assert.doesNotMatch(digestMismatch.output, /Signed fixture observation/,
      'unverified observed text must not be returned');
    console.log('Foraging producer authentication, mission binding, payload tamper and replay refusal: PASS');
  } finally {
    defaultBrowserScout.navigate = navigate;
    await defaultBrowserScout.closeSession(sessionId);
    if (previousLease === undefined) delete process.env.GENOS_MCP_LEASE;
    else process.env.GENOS_MCP_LEASE = previousLease;
    if (oldTrust === undefined) delete process.env.GENOS_FORAGING_TRUST_JSON;
    else process.env.GENOS_FORAGING_TRUST_JSON = oldTrust;
  }
}

async function call(input, throughMcp = false) {
  const args = {
    action: 'forage_step', session_id: input.sessionId,
    history: throughMcp ? ['fixture-observation'] : [{ infoGain: 0.9 }, { infoGain: 0.1 }],
    elapsed_time_sec: 8, next_url: input.url, navigation_scope: input.scope,
    html_content: input.html, mission_id: input.missionId, source_attestation: input.attestation
  };
  const caller = { agentId: input.agentId || 'agent-foraging-1',
    tenant: input.tenant || { organizationId: 'org-foraging', projectId: 'project-foraging' } };
  return throughMcp ? executeToolLogic('genos_biomimicry_optimal_foraging', args, {
    agentId: caller.agentId, tenant: caller.tenant, runLocal: async () => null
  })
    : handleOptimalForaging(args, null, caller);
}

function signObservation(privateKey, fields) {
  const attestation = { ...fields, signature: 'pending' };
  const claims = provenance.attestationClaims(attestation);
  attestation.signature = crypto.sign(null, Buffer.from(JSON.stringify(claims)), privateKey).toString('base64');
  return attestation;
}

run().catch(error => { console.error(error); process.exitCode = 1; });
