/**
 * GenOS Deep Adversarial Security Probes & Vulnerability Exploration
 * Fuzzing XSS filters, unauthenticated route audit, RBAC boundary escapes, and high-load stress.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const { TEST_ADMIN_TOKEN } = require('./testAuth');
const { createApp } = require('./src/app');
const { getDatabase, closeDatabase } = require('./src/db');
const { sanitizeString } = require('./src/middleware/security');
const circuitBreaker = require('./src/services/circuitBreaker');
const MILITARY_OVERRIDE_TOKEN = TEST_ADMIN_TOKEN;

const TEST_PORT = 4299;
let server = null;
let db = null;

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const reqOpts = {
      hostname: 'localhost',
      port: TEST_PORT,
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
    if (body !== null) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function runAdversarialProbes() {
  console.log('=== ADVANCED ADVERSARIAL SECURITY PROBING ===\n');

  const testDbPath = path.resolve(__dirname, 'probe_genos.db');
  if (fs.existsSync(testDbPath)) try { fs.unlinkSync(testDbPath); } catch (e) {}

  db = await getDatabase(testDbPath);
  const app = createApp();
  server = http.createServer(app);
  await new Promise(resolve => server.listen(TEST_PORT, resolve));

  try {
    // Probe 1: Command Palette Route Auth Check
    console.log('--- Probe 1: Command & Terminal Route Protection Audit ---');
    const unauthCmd = await request({ method: 'POST', path: '/api/command' }, { action: 'snapshot_workspace', workspaceId: 'ws-genos-core' });
    console.log(`  [Audit] POST /api/command status without token: ${unauthCmd.status}`);
    console.log(`  [Audit] POST /api/command response:`, unauthCmd.body);

    const unauthTerm = await request({ method: 'POST', path: '/api/terminal' }, { command: 'halt' });
    console.log(`  [Audit] POST /api/terminal status without token: ${unauthTerm.status}`);
    console.log(`  [Audit] POST /api/terminal response:`, unauthTerm.body);
    circuitBreaker.resetHalt('audit');

    // Probe 2: XSS Filter Fuzzing
    console.log('\n--- Probe 2: XSS Sanitization Regular Expression Fuzzing ---');
    const xssPayloads = [
      { name: 'Standard Script', input: '<script>alert(1)</script>' },
      { name: 'Mixed-Case Script', input: '<sCrIpT>alert(1)</sCrIpT>' },
      { name: 'Iframe tag', input: '<iframe src="javascript:alert(1)"></iframe>' },
      { name: 'Quoted event handler', input: '<img src="x" onerror="alert(1)">' },
      { name: 'Single-quoted handler', input: "<img src='x' onerror='alert(1)'>" },
      { name: 'Unquoted event handler', input: '<img src=x onerror=alert(1)>' },
      { name: 'SVG onload', input: '<svg onload="alert(1)">' },
      { name: 'SVG unquoted onload', input: '<svg/onload=alert(1)>' },
      { name: 'Body onload unquoted', input: '<body onload=alert(1)>' },
      { name: 'Javascript pseudo-protocol', input: '<a href="javascript:alert(1)">link</a>' }
    ];

    for (const p of xssPayloads) {
      const sanitized = sanitizeString(p.input);
      const isDangerous = /<script/i.test(sanitized) || /javascript:/i.test(sanitized) || /onerror=/i.test(sanitized) || /onload=/i.test(sanitized);
      console.log(`  Payload: [${p.name}]`);
      console.log(`    Input:     ${p.input}`);
      console.log(`    Sanitized: ${sanitized}`);
      console.log(`    Status:    ${isDangerous ? '⚠️ POTENTIAL BYPASS' : '🛡️ CLEAN'}`);
    }

    // Probe 3: High-Stress 500-Batch SQLite Transaction Burst
    console.log('\n--- Probe 3: Ultra High-Concurrency 200-Batch Stress ---');
    const adminHeaders = { Authorization: `Bearer ${MILITARY_OVERRIDE_TOKEN}` };
    const BURST_COUNT = 200;
    const burstStart = Date.now();
    const burstPromises = [];

    for (let i = 0; i < BURST_COUNT; i++) {
      burstPromises.push(request({
        method: 'POST',
        path: '/api/telemetry/events',
        headers: adminHeaders
      }, {
        agentId: `burst_agent_${i}`,
        eventType: 'HIGH_LOAD_BURST',
        action: 'STRESS_STEP',
        detail: `Burst event payload index ${i}`,
        severity: 'info'
      }));
    }

    const burstResults = await Promise.all(burstPromises);
    const burstDuration = Date.now() - burstStart;
    const burstErrors = burstResults.filter(r => r.status >= 500);
    console.log(`  Burst completed: ${BURST_COUNT} requests in ${burstDuration}ms (${(burstDuration / BURST_COUNT).toFixed(2)}ms/req)`);
    console.log(`  Server errors (5xx): ${burstErrors.length}`);

    const countRow = await db.get('SELECT COUNT(*) as c FROM telemetry_events WHERE event_type = "HIGH_LOAD_BURST"');
    console.log(`  Persisted telemetry events: ${countRow.c}/${BURST_COUNT}`);

  } finally {
    server.close();
    await closeDatabase();
    if (fs.existsSync(testDbPath)) try { fs.unlinkSync(testDbPath); } catch (e) {}
  }
}

runAdversarialProbes().catch(console.error);
