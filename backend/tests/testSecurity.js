'use strict';

/**
 * @file testSecurity.js
 * @description Auth, RBAC & Security protection tests
 */

async function runSecurityTests(options = {}) {
  const { request, assert, token } = options;
  console.log('\n--- 3. Auth, RBAC & Security Protection ---');
  const authRes = await request({ method: 'POST', path: '/api/auth/verify-token' }, { token });
  assert(authRes.status === 200 && authRes.body.valid && authRes.body.role === 'admin', 'Level 5 Override Token authenticated as admin');

  const invRes = await request({ method: 'POST', path: '/api/auth/verify-token' }, { token: 'invalid_token' });
  assert(invRes.status === 401, 'Invalid token rejected with 401 Unauthorized');

  const healthRes = await request({ method: 'GET', path: '/api/health' });
  assert(healthRes.headers['x-frame-options'] === 'DENY', 'X-Frame-Options: DENY header verified');
}

module.exports = { runSecurityTests };