'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const database = require('../src/db');
const { defaultBrowserScout } = require('../src/services/browserScoutService');
const { BrowserPuppeteerAdapter } = require('../src/services/browserPuppeteerAdapter');
const sourceAttestation = require('../src/services/foragingSourceAttestation');
const { handleOptimalForaging } = require('../src/services/mcpBioTools/handlers/optimalForaging');

async function listen(server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server.address().port;
}

function signObservation(privateKey, fields) {
  const attestation = { ...fields, signature: 'pending' };
  attestation.signature = crypto.sign(null,
    Buffer.from(JSON.stringify(sourceAttestation.attestationClaims(attestation))), privateKey).toString('base64');
  return attestation;
}

function createOutsideServer(requests) {
  return http.createServer((request, response) => {
    requests.push({ method: request.method, url: request.url });
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<html><body>OUTSIDE_SCOPE_EFFECT</body></html>');
  });
}

function createSourceServer(outsidePort, state) {
  return http.createServer((request, response) => {
    if (request.url === '/favicon.ico') return sendEmpty(response);
    state.sourceRequests += 1;
    if (state.sourceRequests > 1) return sendRedirect(response, outsidePort);
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<html><body><h1>Signed source page</h1></body></html>');
  });
}

function sendEmpty(response) {
  response.writeHead(204);
  response.end();
}

function sendRedirect(response, outsidePort) {
  response.writeHead(302, { location: `http://127.0.0.1:${outsidePort}/effect` });
  response.end();
}

function browserLaunchOptions(realBrowser, profileDir) {
  if (!realBrowser) return {};
  return { launchOptions: { userDataDir: profileDir,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run',
      '--no-default-browser-check', '--disable-background-networking', '--disable-extensions',
      '--no-zygote', '--no-proxy-server'] } };
}

function assertRefusedBoundary(input) {
  const { result, output, sourceRequests, outsideRequests, sourceUrl, scope, attestation } = input;
  assert.equal(result.status, 'out_of_scope', result.output);
  assert.equal(sourceRequests, 2, 'the scoped endpoint must serve the initial page and redirect response');
  assert.deepEqual(outsideRequests, [], 'the redirected destination must receive no HTTP request');
  assert.equal(result.success, false);
  assert.equal(output.action.status, 'refused');
  assert.equal(output.action.executed, false);
  assert.equal(output.action.verified, false);
  assert.equal(output.observation.currentUrl, sourceUrl, 'the session must remain on the signed in-scope page');
  assert.equal(output.receipt.sourceProvenance.producerId, 'redirect-fixture-producer');
  assert.equal(output.receipt.sourceProvenance.observedOrigin, scope[0]);
  assert.equal(output.receipt.observedTextDigest, attestation.observed_text_digest);
}

class ControlledPage {
  constructor() { this.listeners = new Map(); this.currentUrl = 'about:blank'; this.html = ''; }
  async setViewport() {}
  async setRequestInterception() {}
  on(event, listener) { this.listeners.set(event, listener); }
  async close() {}
  url() { return this.currentUrl; }
  async title() { return this.html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1] || 'Fixture'; }
  async content() { return this.html; }
  async screenshot(options) {
    fs.mkdirSync(path.dirname(options.path), { recursive: true });
    fs.writeFileSync(options.path, Buffer.from('controlled-browser-screenshot'));
  }
  async goto(url) { return this.followRedirects(url); }
  async followRedirects(url) {
    let continued = false;
    let response;
    const request = {
      url: () => url,
      isNavigationRequest: () => true,
      continue: async () => { continued = true; response = await fetch(url, { redirect: 'manual' }); },
      abort: async () => { continued = false; }
    };
    await this.listeners.get('request')(request);
    if (!continued) throw new Error('net::ERR_BLOCKED_BY_CLIENT');
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      return this.followRedirects(new URL(response.headers.get('location'), url).href);
    }
    this.currentUrl = url;
    this.html = await response.text();
    return { ok: () => response.ok, status: () => response.status };
  }
}

class ControlledBrowser {
  constructor() { this.page = new ControlledPage(); }
  async newPage() { return this.page; }
  async close() {}
}

class ControlledPuppeteer {
  async launch() { return new ControlledBrowser(); }
}

async function run() {
  const outsideRequests = [];
  const outside = createOutsideServer(outsideRequests);
  const outsidePort = await listen(outside);
  const sourceState = { sourceRequests: 0 };
  const source = createSourceServer(outsidePort, sourceState);
  const sourcePort = await listen(source);
  const sourceUrl = `http://127.0.0.1:${sourcePort}/start`;
  const scope = [`http://127.0.0.1:${sourcePort}`];
  const sessionId = `foraging-redirect-boundary-${crypto.randomUUID()}`;
  const realBrowser = Boolean(process.env.GENOS_BROWSER_EXECUTABLE_PATH);
  const profileDir = realBrowser ? fs.mkdtempSync(path.join(__dirname, '.foraging-browser-profile-redirect-')) : null;
  const originalAdapter = defaultBrowserScout.browserAdapter;
  const adapter = new BrowserPuppeteerAdapter({
    puppeteer: realBrowser ? undefined : new ControlledPuppeteer()
  });
  const originalGetDatabase = database.getDatabase;
  const originalAllowedHost = adapter.allowedHosts.has('127.0.0.1');
  const priorTrust = process.env.GENOS_FORAGING_TRUST_JSON;
  const keys = crypto.generateKeyPairSync('ed25519');
  process.env.GENOS_FORAGING_TRUST_JSON = JSON.stringify({
    'redirect-fixture-producer': keys.publicKey.export({ type: 'spki', format: 'pem' })
  });
  defaultBrowserScout.browserAdapter = adapter;
  database.getDatabase = async () => ({ get: async (_query, missionId, agentId) => (
    missionId === 'mission-redirect-fixture' && agentId === 'agent-redirect-fixture'
      ? { mission_id: missionId } : null
  ) });
  adapter.allowedHosts.add('127.0.0.1');
  try {
    await defaultBrowserScout.openBrowserSession(sessionId, browserLaunchOptions(realBrowser, profileDir));
    const initialNavigation = await defaultBrowserScout.navigate(sessionId, sourceUrl);
    assert.equal(initialNavigation.success, true, JSON.stringify(initialNavigation));
    assert.equal(defaultBrowserScout.snapshotSession(sessionId).currentUrl, sourceUrl);
    defaultBrowserScout.getSession(sessionId).patchInfoHistory = [
      { infoGain: 0.8 }, { infoGain: 0.1 }, { infoGain: 0.05 }
    ];
    const observation = defaultBrowserScout.snapshotSession(sessionId);
    const attestation = signObservation(keys.privateKey, {
      producer_id: 'redirect-fixture-producer', mission_id: 'mission-redirect-fixture',
      navigation_scope: scope, observed_origin: scope[0], observed_path: '/start',
      observed_text_digest: sourceAttestation.sha256(observation.observationText), source_payload_digest: null
    });
    const result = await handleOptimalForaging({
      action: 'forage_step', session_id: sessionId,
      history: [{ infoGain: 0.8 }, { infoGain: 0.1 }, { infoGain: 0.05 }],
      elapsed_time_sec: 8, next_url: sourceUrl, navigation_scope: scope,
      mission_id: 'mission-redirect-fixture', source_attestation: attestation
    }, undefined, { agentId: 'agent-redirect-fixture' });
    const output = JSON.parse(result.output);
    assertRefusedBoundary({ result, output, sourceRequests: sourceState.sourceRequests,
      outsideRequests, sourceUrl, scope, attestation });
    console.log('Signed foraging redirect boundary: out-of-scope hop refused before destination request; independent server oracle confirms zero effects.');
    console.log(JSON.stringify({ sourceRequests: sourceState.sourceRequests, outsideRequests: outsideRequests.length,
      action: output.action.status, scope: output.receipt.navigationScope }));
  } finally {
    await defaultBrowserScout.closeSession(sessionId);
    await new Promise(resolve => source.close(resolve));
    await new Promise(resolve => outside.close(resolve));
    defaultBrowserScout.browserAdapter = originalAdapter;
    database.getDatabase = originalGetDatabase;
    if (!originalAllowedHost) adapter.allowedHosts.delete('127.0.0.1');
    if (priorTrust === undefined) delete process.env.GENOS_FORAGING_TRUST_JSON;
    else process.env.GENOS_FORAGING_TRUST_JSON = priorTrust;
    if (profileDir) console.log(`Preserved browser profile: ${profileDir}`);
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
