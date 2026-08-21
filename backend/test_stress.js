/**
 * GenOS Backend Adversarial Stress & Security Verification Harness
 * Tests RBAC boundaries, Level 5 Override, CSRF, XSS sanitization, Circuit Breaker, and SQLite concurrency.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const { createApp } = require('./src/app');
const { getDatabase, closeDatabase } = require('./src/db');
const circuitBreaker = require('./src/services/circuitBreaker');
const { MILITARY_OVERRIDE_TOKEN, hashKey } = require('./src/middleware/auth');
const { sanitizeString } = require('./src/middleware/security');


const TEST_PORT = 4199;
let server = null;
let db = null;
let passedCount = 0;
let failedCount = 0;

function assert(condition, message, details = null) {
  if (!condition) {
    failedCount++;
    console.error(`  ❌ FAIL: ${message}` + (details ? ` | ${JSON.stringify(details)}` : ''));
    throw new Error(message);
  } else {
    passedCount++;
    console.log(`  ✅ PASS: ${message}`);
  }
}

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

async function setupTestKeys() {
  const viewerKey = 'genos_sk_viewer_secret_test_123';
  const operatorKey = 'genos_sk_operator_secret_test_456';
  await db.run(
    'INSERT OR REPLACE INTO access_keys (id, key_hash, label, role, permissions, is_active) VALUES (?, ?, ?, ?, ?, ?)',
    'key-viewer-01', hashKey(viewerKey), 'Viewer Node', 'viewer', '["read", "telemetry:read"]', 1
  );
  await db.run(
    'INSERT OR REPLACE INTO access_keys (id, key_hash, label, role, permissions, is_active) VALUES (?, ?, ?, ?, ?, ?)',
    'key-operator-01', hashKey(operatorKey), 'Operator Node', 'operator', '["read", "workspace:write", "experiment:write", "experiment:run", "swarm:vote", "swarm:propose", "mcp:execute_safe", "emergency_kill"]', 1
  );
  return { viewerKey, operatorKey };
}

async function testRbacBoundaries(keys) {
  console.log('\n--- 1. RBAC Boundaries & Unauthorized Rejection ---');
  const unauthRoutes = [
    { method: 'POST', path: '/api/deploy', body: { name: 'agent' } },
    { method: 'POST', path: '/api/deploy/trinity', body: {} },
    { method: 'POST', path: '/api/halt', body: {} },
    { method: 'POST', path: '/api/security/kill-switch', body: {} },
    { method: 'POST', path: '/api/security/kill-switch/reset', body: {} },
    { method: 'POST', path: '/api/mcp/circuit-breaker', body: { toolName: 'genos_run', locked: true } },
    { method: 'POST', path: '/api/mcp/equip', body: { toolName: 'genos_run' } },
    { method: 'POST', path: '/api/mcp/execute', body: { toolName: 'genos_inspect' } },
    { method: 'GET', path: '/api/auth/keys', body: null },
    { method: 'POST', path: '/api/auth/keys', body: { label: 'hack' } },
    { method: 'POST', path: '/api/workspaces', body: { name: 'hack-ws' } },
    { method: 'POST', path: '/api/experiments', body: { title: 'hack-exp' } },
    { method: 'POST', path: '/api/swarm/vote', body: { proposalId: 'prop-001', vote: 'yes' } },
    { method: 'POST', path: '/api/nodes/clone', body: { nodeId: 'node-root' } },
    { method: 'POST', path: '/api/command', body: { action: 'inspect_state' } },
    { method: 'POST', path: '/api/terminal', body: { command: 'status' } }
  ];

  for (const r of unauthRoutes) {
    const res = await request({ method: r.method, path: r.path }, r.body);
    assert(res.status === 401, `Unauthenticated ${r.method} ${r.path} rejected with 401 Unauthorized`, res.body);
  }

  const viewerHeaders = { Authorization: `Bearer ${keys.viewerKey}` };
  const viewerForbiddenRoutes = [
    { method: 'POST', path: '/api/deploy', body: { name: 'viewer-agent' } },
    { method: 'POST', path: '/api/halt', body: {} },
    { method: 'POST', path: '/api/security/kill-switch/reset', body: {} },
    { method: 'POST', path: '/api/mcp/circuit-breaker', body: { toolName: 'genos_run', locked: true } },
    { method: 'GET', path: '/api/auth/keys', body: null },
    { method: 'POST', path: '/api/auth/keys', body: { label: 'hack' } },
    { method: 'POST', path: '/api/workspaces', body: { name: 'hack-ws' } },
    { method: 'POST', path: '/api/experiments', body: { title: 'hack-exp' } },
    { method: 'POST', path: '/api/swarm/vote', body: { proposalId: 'prop-001', vote: 'yes' } },
    { method: 'POST', path: '/api/command', body: { action: 'inspect_state' } },
    { method: 'POST', path: '/api/terminal', body: { command: 'status' } }
  ];

  for (const r of viewerForbiddenRoutes) {
    const res = await request({ method: r.method, path: r.path, headers: viewerHeaders }, r.body);
    assert(res.status === 403, `Viewer access to ${r.method} ${r.path} rejected with 403 Forbidden`, res.body);
  }

  const opHeaders = { Authorization: `Bearer ${keys.operatorKey}` };
  const opAllowedRes = await request({ method: 'POST', path: '/api/deploy', headers: opHeaders }, { name: 'op-agent-1' });
  assert(opAllowedRes.status === 200 || opAllowedRes.status === 201, 'Operator successfully deploys agent (workspace:write)');

  const opCmdRes = await request({ method: 'POST', path: '/api/command', headers: opHeaders }, { action: 'inspect_state' });
  assert(opCmdRes.status === 200 && opCmdRes.body.success === true, 'Operator allowed to execute command palette actions');

  const opTermRes = await request({ method: 'POST', path: '/api/terminal', headers: opHeaders }, { command: 'status' });
  assert(opTermRes.status === 200 && opTermRes.body.output.includes('SYSTEM OK'), 'Operator allowed to execute terminal commands');

  const opResetRes = await request({ method: 'POST', path: '/api/security/kill-switch/reset', headers: opHeaders });
  assert(opResetRes.status === 403, 'Operator blocked from admin-only kill switch reset with 403');

  const opKeysRes = await request({ method: 'GET', path: '/api/auth/keys', headers: opHeaders });
  assert(opKeysRes.status === 403, 'Operator blocked from admin-only key listing with 403');
}

async function testMilitaryOverride() {
  console.log('\n--- 2. Level 5 Military Override Elevation ---');
  const authRes = await request({ method: 'POST', path: '/api/auth/verify-token' }, { token: MILITARY_OVERRIDE_TOKEN });
  assert(authRes.status === 200 && authRes.body.valid === true && authRes.body.role === 'admin' && authRes.body.isOverride === true, 'Military token validated with admin role');

  const sessRes = await request({ method: 'GET', path: '/api/auth/session', headers: { Authorization: `Bearer ${MILITARY_OVERRIDE_TOKEN}` } });
  assert(sessRes.status === 200 && sessRes.body.user.role === 'admin' && sessRes.body.user.isOverride === true, 'Session reflects MILITARY_OVERRIDE_ROOT via Bearer');

  const sessKeyRes = await request({ method: 'GET', path: '/api/auth/session', headers: { 'X-Access-Key': MILITARY_OVERRIDE_TOKEN } });
  assert(sessKeyRes.status === 200 && sessKeyRes.body.user.role === 'admin', 'Session reflects admin context via X-Access-Key header');

  const adminHeaders = { Authorization: `Bearer ${MILITARY_OVERRIDE_TOKEN}` };
  const createKeyRes = await request({ method: 'POST', path: '/api/auth/keys', headers: adminHeaders }, { label: 'Special-Op-Key', role: 'operator', permissions: ['read', 'workspace:write'] });
  assert(createKeyRes.status === 201 && createKeyRes.body.key !== undefined, 'Military Override successfully created access key');

  const resetRes = await request({ method: 'POST', path: '/api/security/kill-switch/reset', headers: adminHeaders });
  assert(resetRes.status === 200 && resetRes.body.success === true, 'Military Override successfully reset kill switch');
}

async function testCsrfProtection() {
  console.log('\n--- 3. CSRF & Cross-Origin Attack Defense ---');
  const foreignOrigins = ['http://evil.attacker.com', 'https://phishing-genos.net', 'http://localhost:8080'];
  for (const origin of foreignOrigins) {
    const res = await request({ method: 'POST', path: '/api/workspaces', headers: { Origin: origin, Authorization: `Bearer ${MILITARY_OVERRIDE_TOKEN}` } }, { name: 'evil-ws' });
    assert(res.status === 403 && res.body.error && res.body.error.code === 'FORBIDDEN_ORIGIN', `Blocked foreign origin '${origin}' with 403`);
  }

  const csrfFailRes = await request({
    method: 'POST',
    path: '/api/workspaces',
    headers: { Origin: 'http://localhost:3000', 'X-CSRF-Token': '' }
  }, { name: 'no-csrf-ws' });
  assert(csrfFailRes.status === 403 && csrfFailRes.body.error && csrfFailRes.body.error.code === 'CSRF_VALIDATION_FAILED', 'Mutating request without CSRF/Auth blocked with 403');

  const csrfPassRes = await request({
    method: 'POST',
    path: '/api/workspaces',
    headers: { Origin: 'http://localhost:3000', 'X-CSRF-Token': 'valid-csrf-token' }
  }, { name: 'valid-csrf-ws' });
  assert(csrfPassRes.status === 401, 'Request with valid CSRF token passed CSRF check (reached auth check: 401)');

  const loginRes = await request({
    method: 'POST',
    path: '/api/auth/verify-token',
    headers: { Origin: 'http://localhost:3000', 'X-CSRF-Token': '' }
  }, { token: MILITARY_OVERRIDE_TOKEN });
  assert(loginRes.status === 200 && loginRes.body.valid === true, 'Auth verification endpoint exempted from CSRF token requirement');
}

async function testXssSanitization() {
  console.log('\n--- 4. XSS Payload Sanitization & Injection Defense ---');
  const adminHeaders = { Authorization: `Bearer ${MILITARY_OVERRIDE_TOKEN}` };

  const maliciousProfile = {
    username: 'Commander<script>alert("XSS")</script>'
  };

  const profRes = await request({ method: 'POST', path: '/api/profile', headers: adminHeaders }, maliciousProfile);
  assert(profRes.status === 200, 'POST /api/profile with XSS payloads handled');
  assert(!profRes.body.username.includes('<script>'), 'Script tag stripped from username');
  assert(profRes.body.username === 'Commander', `Username sanitized correctly (expected 'Commander', got '${profRes.body.username}')`);

  // Direct comprehensive fuzzing of XSS filter for unquoted/malformed handlers
  assert(!sanitizeString('<img src=x onerror=alert(1)>').includes('onerror='), 'Unquoted onerror stripped');
  assert(!sanitizeString('<svg/onload=alert(1)>').includes('onload='), 'Unquoted svg onload stripped');
  assert(!sanitizeString('<body onload=alert(1)>').includes('onload='), 'Unquoted body onload stripped');
  assert(!sanitizeString('<a href="javascript:alert(1)">link</a>').includes('javascript:'), 'Javascript URI stripped');

  const wsPayload = {
    name: 'XSS-Test-WS-<script>alert(1)</script>',
    description: '<iframe src="http://attacker.com"></iframe><img src=x onerror=alert(1)>Secure description',
    tags: ['<a href="javascript:alert(1)">tag1</a>', '<img src="x" onerror="steal()">', '<img src=x onerror=alert(1)>']
  };

  const wsRes = await request({ method: 'POST', path: '/api/workspaces', headers: adminHeaders }, wsPayload);
  assert(wsRes.status === 201, 'Workspace created with sanitized payloads');
  const createdWs = await db.get('SELECT * FROM workspaces WHERE name = ?', 'XSS-Test-WS-');
  assert(createdWs !== undefined, 'Database contains sanitized workspace name without script tag');
  assert(!createdWs.description.includes('<iframe'), 'Database description stripped of iframe tags');
  assert(!createdWs.description.includes('onerror='), 'Database description stripped of unquoted onerror');
}

async function testCircuitBreakerStateMachine() {
  console.log('\n--- 5. MCP Circuit Breaker State Machine & Resilience ---');
  circuitBreaker.resetHalt('test_runner');
  assert(circuitBreaker.getStatus().state === 'CLOSED', 'Circuit Breaker initialized in CLOSED state');

  circuitBreaker.recordFailure('genos_run', 'Simulated timeout 1');
  assert(circuitBreaker.getStatus().failureCount === 1 && circuitBreaker.getStatus().state === 'CLOSED', 'Failure 1: state CLOSED');

  circuitBreaker.recordFailure('genos_run', 'Simulated crash 2');
  assert(circuitBreaker.getStatus().failureCount === 2 && circuitBreaker.getStatus().state === 'CLOSED', 'Failure 2: state CLOSED');

  circuitBreaker.recordFailure('genos_run', 'Simulated fatal 3');
  assert(circuitBreaker.getStatus().failureCount === 3 && circuitBreaker.getStatus().state === 'OPEN', 'Failure 3: tripped to OPEN');

  const checkDestructive = circuitBreaker.canExecute('genos_run', 'admin');
  assert(checkDestructive.allowed === false && checkDestructive.reason === 'CIRCUIT_OPEN', 'High-risk tool blocked in OPEN state');

  const checkSafe = circuitBreaker.canExecute('genos_inspect', 'admin');
  assert(checkSafe.allowed === true, 'Safe read-only tool genos_inspect allowed while OPEN');

  circuitBreaker.toggleToolLock('genos_inspect', true, 'Manual quarantine');
  const checkLocked = circuitBreaker.canExecute('genos_inspect', 'admin');
  assert(checkLocked.allowed === false && checkLocked.reason === 'TOOL_LOCKED', 'Quarantined safe tool blocked');
  circuitBreaker.toggleToolLock('genos_inspect', false);

  circuitBreaker.lastStateChange = Date.now() - 65000;
  const halfOpenState = circuitBreaker.checkState();
  assert(halfOpenState === 'HALF-OPEN', 'Circuit breaker transitioned to HALF-OPEN after cooldown');

  circuitBreaker.recordSuccess('genos_run');
  assert(circuitBreaker.getStatus().state === 'CLOSED' && circuitBreaker.getStatus().failureCount === 0, 'Canary success reset Breaker to CLOSED');

  circuitBreaker.recordFailure('genos_run', 'Trip 1');
  circuitBreaker.recordFailure('genos_run', 'Trip 2');
  circuitBreaker.recordFailure('genos_run', 'Trip 3');
  assert(circuitBreaker.getStatus().state === 'OPEN', 'Re-tripped to OPEN');

  circuitBreaker.lastStateChange = Date.now() - 65000;
  circuitBreaker.checkState();
  assert(circuitBreaker.getStatus().state === 'HALF-OPEN', 'In HALF-OPEN mode');

  circuitBreaker.recordFailure('genos_run', 'Canary failed');
  assert(circuitBreaker.getStatus().state === 'OPEN', 'Canary failure in HALF-OPEN immediately tripped to OPEN');

  circuitBreaker.triggerHalt('Stress Test Quarantine', 'test_runner');
  assert(circuitBreaker.getStatus().isHalted === true, 'Global halt engaged');
  const checkHalted = circuitBreaker.canExecute('genos_inspect', 'admin');
  assert(checkHalted.allowed === false && checkHalted.reason === 'SYSTEM_HALTED', 'All tools blocked during Global Halt');

  circuitBreaker.resetHalt('test_runner');
  assert(circuitBreaker.getStatus().isHalted === false && circuitBreaker.getStatus().state === 'CLOSED', 'Kill switch disarmed, state CLOSED');
}

async function testSqliteConcurrency() {
  console.log('\n--- 6. High-Concurrency & SQLite Lock Contention Stress ---');
  const adminHeaders = { Authorization: `Bearer ${MILITARY_OVERRIDE_TOKEN}` };
  const CONCURRENCY_COUNT = 100;
  const startTime = Date.now();
  console.log(`  Dispatching ${CONCURRENCY_COUNT} concurrent read/write requests...`);

  const promises = [];
  for (let i = 0; i < CONCURRENCY_COUNT; i++) {
    const mod = i % 4;
    if (mod === 0) {
      promises.push(request({ method: 'POST', path: '/api/workspaces', headers: adminHeaders }, {
        name: `stress-ws-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        language: 'Rust', description: `Stress worker batch ${i}`
      }));
    } else if (mod === 1) {
      promises.push(request({ method: 'POST', path: '/api/swarm/vote', headers: adminHeaders }, {
        proposalId: 'prop-001', agentId: `stress_agent_${i}`, vote: i % 2 === 0 ? 'yes' : 'no', reason: `Stress vote ${i}`
      }));
    } else if (mod === 2) {
      promises.push(request({ method: 'POST', path: '/api/telemetry/events', headers: adminHeaders }, {
        agentId: `stress_telemetry_${i}`, eventType: 'STRESS_BENCHMARK', action: 'CONCURRENT_BURST', detail: `Stress #${i}`, severity: 'info'
      }));
    } else {
      promises.push(request({ method: 'GET', path: '/api/workspaces', headers: adminHeaders }));
    }
  }

  const responses = await Promise.all(promises);
  const durationMs = Date.now() - startTime;
  console.log(`  Completed ${CONCURRENCY_COUNT} concurrent requests in ${durationMs}ms (avg ${(durationMs / CONCURRENCY_COUNT).toFixed(2)}ms/req)`);

  let errorCount = 0;
  for (let idx = 0; idx < responses.length; idx++) {
    if (responses[idx].status >= 500) {
      errorCount++;
      console.error(`  Concurrent request ${idx} failed with status ${responses[idx].status}:`, responses[idx].body);
    }
  }

  assert(errorCount === 0, `All ${CONCURRENCY_COUNT} concurrent requests completed with 0 server/database lock errors (5xx = ${errorCount})`);
  const pragmaMode = await db.get('PRAGMA journal_mode;');
  assert(pragmaMode && pragmaMode.journal_mode.toLowerCase() === 'wal', `SQLite journal_mode is active WAL (got '${pragmaMode ? pragmaMode.journal_mode : 'none'}')`);

  const voteCountRow = await db.get('SELECT COUNT(*) as count FROM swarm_votes WHERE proposal_id = "prop-001"');
  assert(voteCountRow && voteCountRow.count >= 25, `Swarm votes correctly persisted under concurrency (total votes: ${voteCountRow.count})`);
}

async function runAllStressTests() {
  console.log('===============================================================');
  console.log('  GENOS STUDIO BACKEND ADVERSARIAL STRESS CHALLENGER SUITE     ');
  console.log('===============================================================\n');

  const testDbPath = path.resolve(__dirname, 'stress_genos.db');
  if (fs.existsSync(testDbPath)) {
    try { fs.unlinkSync(testDbPath); } catch (e) {}
  }

  db = await getDatabase(testDbPath);
  const keys = await setupTestKeys();
  const app = createApp();
  server = http.createServer(app);
  await new Promise(resolve => server.listen(TEST_PORT, resolve));
  console.log(`Adversarial test server active on http://localhost:${TEST_PORT}\n`);

  try {
    await testRbacBoundaries(keys);
    await testMilitaryOverride();
    await testCsrfProtection();
    await testXssSanitization();
    await testCircuitBreakerStateMachine();
    await testSqliteConcurrency();

    console.log('\n===============================================================');
    console.log(` STRESS CHALLENGER SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('===============================================================\n');
  } finally {
    server.close();
    await closeDatabase();
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch (e) {}
    }
  }

  if (failedCount > 0) process.exit(1);
}

runAllStressTests().catch(err => {
  console.error('Fatal stress challenger exception:', err);
  process.exit(1);
});
