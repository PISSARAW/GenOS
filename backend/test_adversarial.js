const http = require('http');
const { TEST_ADMIN_TOKEN, TEST_VIEWER_TOKEN } = require('./testAuth');
const { createApp } = require('./src/app');
const { getDatabase, closeDatabase } = require('./src/db');
const circuitBreaker = require('./src/services/circuitBreaker');
const MILITARY_OVERRIDE_TOKEN = TEST_ADMIN_TOKEN;

const TEST_PORT = 4199;
let server;
let db;

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: TEST_PORT,
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'csrf-valid-token',
        ...(options.headers || {})
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) { json = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function runAdversarialTests() {
  console.log('--- STARTING ADVERSARIAL STRESS TEST SUITE ---');
  db = await getDatabase();
  const app = createApp();
  server = http.createServer(app);
  await new Promise(r => server.listen(TEST_PORT, r));

  try {
    // 1. Role Boundary: Viewer trying to execute destructive MCP tool
    console.log('[Test 1] Viewer attempting to execute destructive tool genos_restore...');
    const viewerToolRes = await request({
      method: 'POST',
      path: '/api/mcp/execute',
      headers: { Authorization: `Bearer ${TEST_VIEWER_TOKEN}` }
    }, { toolName: 'genos_restore', args: {} });
    console.log('  Viewer destructive tool result:', viewerToolRes.status, viewerToolRes.body && viewerToolRes.body.error ? viewerToolRes.body.error.code : 'UNKNOWN');
    if (viewerToolRes.status === 403 || viewerToolRes.status === 503) {
      console.log('  -> PASS: Viewer blocked from destructive execution');
    } else {
      throw new Error('Viewer allowed destructive execution!');
    }

    // 2. Unauthenticated write attempt on workspace
    console.log('[Test 2] Unauthenticated write to /api/workspaces...');
    const unauthWsRes = await request({
      method: 'POST',
      path: '/api/workspaces'
    }, { name: 'Unauthorized-Workspace' });
    console.log('  Unauthenticated write result:', unauthWsRes.status, unauthWsRes.body && unauthWsRes.body.error ? unauthWsRes.body.error.code : 'UNKNOWN');
    if (unauthWsRes.status === 401) {
      console.log('  -> PASS: Unauthenticated mutating write rejected with 401 Unauthorized');
    } else {
      throw new Error('Unauthenticated write was not rejected!');
    }

    // 3. XSS Sanitization verification
    console.log('[Test 3] XSS payload sanitization in proposal title...');
    const xssRes = await request({
      method: 'POST',
      path: '/api/swarm/proposals',
      headers: { Authorization: `Bearer ${MILITARY_OVERRIDE_TOKEN}` }
    }, {
      title: 'Harmless <script>alert(1)</script>Proposal <iframe src="evil.com"></iframe>',
      description: 'Clean description'
    });
    console.log('  Proposal created:', xssRes.status, xssRes.body);
    const dbProp = await db.get('SELECT title FROM swarm_proposals WHERE id = ?', xssRes.body.proposalId);
    console.log('  Sanitized title in DB:', dbProp.title);
    if (!dbProp.title.includes('<script>') && !dbProp.title.includes('<iframe>')) {
      console.log('  -> PASS: XSS tags completely stripped before DB persistence');
    } else {
      throw new Error('XSS payload survived sanitization!');
    }

    // 4. Circuit Breaker 3-failure trip to OPEN
    console.log('[Test 4] Circuit breaker trip to OPEN after 3 consecutive failures...');
    circuitBreaker.resetHalt('test_runner');
    circuitBreaker.state = 'CLOSED';
    circuitBreaker.failureCount = 0;

    circuitBreaker.recordFailure('genos_run', 'Simulation fault 1');
    circuitBreaker.recordFailure('genos_run', 'Simulation fault 2');
    circuitBreaker.recordFailure('genos_run', 'Simulation fault 3');

    const cbStatus = circuitBreaker.getStatus();
    console.log('  Circuit Breaker state after 3 failures:', cbStatus.state);
    if (cbStatus.state === 'OPEN') {
      console.log('  -> PASS: Circuit breaker tripped to OPEN');
    } else {
      throw new Error('Circuit breaker failed to trip to OPEN!');
    }

    // 5. Destructive tool blocked while OPEN
    const blockedOpen = circuitBreaker.canExecute('genos_run', 'admin');
    console.log('  canExecute(genos_run) when OPEN:', blockedOpen.allowed, blockedOpen.reason);
    if (!blockedOpen.allowed && blockedOpen.reason === 'CIRCUIT_OPEN') {
      console.log('  -> PASS: High-risk destructive tool blocked during OPEN circuit');
    } else {
      throw new Error('Destructive tool was allowed during OPEN circuit!');
    }

    // 6. Reset Circuit Breaker
    circuitBreaker.resetHalt('test_runner');
    console.log('  Circuit breaker reset status:', circuitBreaker.getStatus().state);

    console.log('\n--- ALL ADVERSARIAL STRESS TESTS PASSED ---');
  } finally {
    server.close();
    await closeDatabase();
  }
}

runAdversarialTests().catch(err => {
  console.error('Adversarial test error:', err);
  process.exit(1);
});
