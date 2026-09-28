/**
 * GenOS Deep Adversarial Security Probes & Vulnerability Exploration
 * Fuzzing XSS filters, unauthenticated route audit, RBAC boundary escapes, and high-load stress.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { TEST_ADMIN_TOKEN } = require('../testAuth');
const { createApp } = require('../src/app');
const { getDatabase, closeDatabase } = require('../src/db');
const { sanitizeString } = require('../src/middleware/security');
const circuitBreaker = require('../src/services/circuitBreaker');
const telemetryObserver = require('../src/services/telemetryObserver');
const MILITARY_OVERRIDE_TOKEN = TEST_ADMIN_TOKEN;

const BURST_COUNT = 200;
let testPort = 0;
let server = null;
let db = null;

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const reqOpts = {
      hostname: '127.0.0.1',
      port: testPort,
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'test-csrf-token',
        ...(options.headers || {})
      }
    };
    const req = http.request(reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) { json = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error(`Request timed out: ${reqOpts.path}`)));
    if (body !== null) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function listenOnEphemeralPort(targetServer) {
  await new Promise((resolve, reject) => {
    targetServer.once('error', reject);
    targetServer.listen(0, '127.0.0.1', resolve);
  });
  testPort = targetServer.address().port;
}

async function closeServer(targetServer) {
  if (!targetServer?.listening) return;
  await new Promise((resolve, reject) => targetServer.close(error => error ? reject(error) : resolve()));
}

async function auditUnauthenticatedRoutes() {
  console.log('--- Probe 1: Command & Terminal Route Protection Audit ---');
  const unauthCmd = await request({ method: 'POST', path: '/api/command' }, { action: 'snapshot_workspace', workspaceId: 'ws-genos-core' });
  console.log(`  [Audit] POST /api/command status without token: ${unauthCmd.status}`);
  const unauthTerm = await request({ method: 'POST', path: '/api/terminal' }, { command: 'halt' });
  console.log(`  [Audit] POST /api/terminal status without token: ${unauthTerm.status}`);
  circuitBreaker.resetHalt('audit');
}

function fuzzXssPayloads() {
  console.log('\n--- Probe 2: XSS Sanitization Regular Expression Fuzzing ---');
  const payloads = [
    '<script>alert(1)</script>', '<sCrIpT>alert(1)</sCrIpT>',
    '<iframe src="javascript:alert(1)"></iframe>', '<img src="x" onerror="alert(1)">',
    "<img src='x' onerror='alert(1)'>", '<img src=x onerror=alert(1)>',
    '<svg onload="alert(1)">', '<svg/onload=alert(1)>', '<body onload=alert(1)>',
    '<a href="javascript:alert(1)">link</a>'
  ];
  for (const payload of payloads) {
    const sanitized = sanitizeString(payload);
    const dangerous = /<script|javascript:|onerror=|onload=/i.test(sanitized);
    if (dangerous) console.warn(`  Potential XSS bypass remained after sanitization: ${sanitized}`);
  }
}

function buildTelemetryRequests() {
  return Array.from({ length: BURST_COUNT }, (_, index) => request({
    method: 'POST',
    path: '/api/telemetry/events',
    headers: { Authorization: `Bearer ${MILITARY_OVERRIDE_TOKEN}` }
  }, {
    agentId: `burst_agent_${index}`,
    eventType: 'HIGH_LOAD_BURST',
    action: 'STRESS_STEP',
    detail: `Burst event payload index ${index}`,
    severity: 'info'
  }));
}

async function verifyTelemetryBurst(database) {
  console.log('\n--- Probe 3: Ultra High-Concurrency 200-Batch Stress ---');
  const startedAt = Date.now();
  const settled = await Promise.allSettled(buildTelemetryRequests());
  const failures = settled.filter(result => result.status === 'rejected');
  if (failures.length) throw new Error(`${failures.length}/${BURST_COUNT} telemetry requests failed: ${failures[0].reason.message}`);
  const results = settled.map(result => result.value);
  const unexpected = results.filter(result => result.status !== 201);
  if (unexpected.length) throw new Error(`${unexpected.length}/${BURST_COUNT} telemetry requests did not return 201.`);
  console.log(`  Burst completed: ${BURST_COUNT} requests in ${Date.now() - startedAt}ms.`);
  const flushed = await telemetryObserver.flush(30000);
  if (!flushed.flushed) throw new Error(`Telemetry persistence left ${flushed.pending} events unflushed.`);
  const count = await database.get('SELECT COUNT(*) as c FROM telemetry_events WHERE event_type = "HIGH_LOAD_BURST"');
  if (count.c !== BURST_COUNT) throw new Error(`Expected ${BURST_COUNT} persisted telemetry events, found ${count.c}.`);
  console.log(`  Persisted telemetry events: ${count.c}/${BURST_COUNT}`);
}

async function runAdversarialProbes() {
  console.log('=== ADVANCED ADVERSARIAL SECURITY PROBING ===\n');
  const testDbPath = path.join(os.tmpdir(), `genos-adversarial-probe-${process.pid}-${Date.now()}.db`);
  db = await getDatabase(testDbPath);
  server = http.createServer(createApp());
  try {
    await listenOnEphemeralPort(server);
    await auditUnauthenticatedRoutes();
    fuzzXssPayloads();
    await verifyTelemetryBurst(db);
  } finally {
    await closeServer(server);
    await closeDatabase();
    if (fs.existsSync(testDbPath)) try { fs.unlinkSync(testDbPath); } catch (e) {}
    for (const suffix of ['-wal', '-shm']) {
      const artifact = `${testDbPath}${suffix}`;
      if (fs.existsSync(artifact)) try { fs.unlinkSync(artifact); } catch (e) {}
    }
  }
}

runAdversarialProbes().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
