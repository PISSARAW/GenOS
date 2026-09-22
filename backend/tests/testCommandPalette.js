'use strict';

/**
 * @file testCommandPalette.js
 * @description Command Palette, Terminal & Kill Switch tests
 */

async function runCommandPaletteTests(options = {}) {
  const { request, assert, token } = options;
  console.log('\n--- 11. Command Palette, Terminal & Emergency Kill Switch ---');
  const unauthTerm = await request({ method: 'POST', path: '/api/terminal', skipDefaultAuth: true }, { command: 'status' });
  assert(unauthTerm.status === 401, 'Unauthenticated POST /api/terminal rejected with 401');

  const termRes = await request({
    method: 'POST',
    path: '/api/terminal',
    headers: { Authorization: `Bearer ${token}` }
  }, { command: 'status' });
  assert(termRes.status === 200 && termRes.body.output.includes('SYSTEM OK'), 'Authenticated POST /api/terminal executed');

  const cmdRes = await request({
    method: 'POST',
    path: '/api/command',
    headers: { Authorization: `Bearer ${token}` }
  }, { action: 'inspect_state' });
  assert(cmdRes.status === 200 && cmdRes.body.success === true, 'Authenticated POST /api/command executed');

  const killRes = await request({
    method: 'POST',
    path: '/api/security/kill-switch',
    headers: { Authorization: `Bearer ${token}` }
  }, { reason: 'Automated test halt' });
  assert(killRes.status === 200 && killRes.body.success === true, 'POST /api/security/kill-switch triggered halt');

  await request({
    method: 'POST',
    path: '/api/security/kill-switch/reset',
    headers: { Authorization: `Bearer ${token}` }
  });
}

module.exports = { runCommandPaletteTests };