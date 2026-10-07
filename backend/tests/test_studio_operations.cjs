'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const fixture = require('./helpers/b06ClientFixture.cjs');
const { request } = require('./helpers/studioRequest.cjs');

async function main() {
  const spec = await fixture.prepare();
  const server = require('../src/app').createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  spec.url = `http://127.0.0.1:${server.address().port}`;
  const state = require('../src/services/agentOrchestrationState');
  let child;
  try {
    const route = '/api/agents/consumer-promotion-agent/stop';
    const unknown = await request(spec, route, { body: {} });
    assert.equal(unknown.status, 409, JSON.stringify(unknown.value));
    assert.equal(unknown.value.error.code, 'EXTERNAL_RUNTIME_UNVERIFIED');
    assert.ok(await spec.db.get("SELECT id FROM agents WHERE id='consumer-promotion-agent'"));
    await spec.db.run("UPDATE agents SET status='idle' WHERE id='consumer-promotion-agent'");
    const idle = await request(spec, route, { body: {} });
    assert.equal(idle.value.confirmed, true);
    assert.equal(idle.value.stopped, false);
    child = spawn(process.execPath, ['-e', 'setInterval(() => {},1000)'], { windowsHide: true, stdio: 'ignore' });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    state.activeProcesses.set('consumer-promotion-agent', child);
    child.once('exit', () => state.activeProcesses.delete('consumer-promotion-agent'));
    await spec.db.run("UPDATE agents SET status='running' WHERE id='consumer-promotion-agent'");
    const stopped = await request(spec, route, { body: {}, timeoutMs: 20000 });
    assert.equal(stopped.status, 200, JSON.stringify(stopped.value));
    assert.equal(stopped.value.confirmed, true);
    assert.equal(stopped.value.stopped, true);
    assert.equal(require('../src/services/garageProcessControl').pidAlive(child.pid), false);
    assert.equal((await request(spec, '/api/studio/restart', { body: { confirmed: true } })).status, 403);
    await spec.db.run("UPDATE access_keys SET role='admin' WHERE id='b06-key'");
    const unavailable = await request(spec, '/api/studio/restart', { body: { confirmed: true } });
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.value.error.code, 'STUDIO_SUPERVISOR_UNAVAILABLE');
    const rust = await request(spec, '/api/rust/status');
    assert.equal(rust.value.contractVersion, 1);
    assert.ok(rust.value.requestId);
    console.log('Studio operations: real PID disappearance, external refusal, idle state, admin and supervisor gates passed.');
  } finally {
    if (child && require('../src/services/garageProcessControl').pidAlive(child.pid)) child.kill();
    state.activeProcesses.delete('consumer-promotion-agent');
    await new Promise(resolve => server.close(resolve));
    await require('../src/db').closeDatabase();
    fs.rmSync(spec.root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
