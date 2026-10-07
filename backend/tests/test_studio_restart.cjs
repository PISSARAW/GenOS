'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { fork } = require('node:child_process');
const fixture = require('./helpers/b06ClientFixture.cjs');
const { request } = require('./helpers/studioRequest.cjs');

async function port() {
  const server = net.createServer().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const value = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return value;
}

async function waitReady(spec, previous) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    try {
      const result = await request(spec, '/api/studio/status' + (previous ? '?operationId=' + previous.operationId : ''));
      if (result.status === 200 && result.value.ready && result.value.instanceId !== previous?.instanceId) return result.value;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Supervisor readiness timeout');
}

async function main() {
  const spec = await fixture.prepare();
  await spec.db.run("UPDATE agents SET status='idle' WHERE id='consumer-promotion-agent'");
  await spec.db.run("UPDATE access_keys SET role='admin' WHERE id='b06-key'");
  await require('../src/db').closeDatabase();
  spec.url = `http://127.0.0.1:${await port()}`;
  const supervisor = fork(path.resolve(__dirname, '../bin/genos-studio-supervisor.cjs'), [], {
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: { ...process.env, PORT: spec.url.split(':').pop(), GRPC_PORT: String(await port()),
      GENOS_TRINITY_MONITOR_ENABLED: '0', GENOS_AUTOBIOGRAPHICAL_MEMORY_ENABLED: '0',
      GENOS_IDLE_TICK_AUTONOMOUS: '0', GENOS_ENABLE_AUTOSTART: '0', GENOS_DB_BACKUP_SKIP: '1' }
  });
  let output = '';
  supervisor.stdout.on('data', chunk => { output += chunk; });
  supervisor.stderr.on('data', chunk => { output += chunk; });
  const exited = new Promise(resolve => supervisor.once('exit', resolve));
  try {
    const before = await waitReady(spec);
    assert.equal(before.supervised, true);
    const operation = await request(spec, '/api/studio/restart', { body: { confirmed: true }, timeoutMs: 20000 });
    assert.equal(operation.status, 202, JSON.stringify(operation.value));
    const after = await waitReady(spec, operation.value);
    assert.notEqual(after.pid, before.pid);
    assert.equal(after.operation.state, 'completed');
    assert.equal(after.operation.previousInstanceId, before.instanceId);
    const agents = await request(spec, '/api/agents');
    assert.ok(agents.value.some(agent => agent.id === 'consumer-promotion-agent'));
    const other = await request(spec, '/api/studio/status?operationId=' + operation.value.operationId, { project: 'b06-other' });
    assert.equal(other.value.operation, null);
    console.log(`Studio restart: native ${process.platform} supervisor, new PID/instance, readiness, persisted tenant data and private operation passed.`);
  } catch (error) { console.error(output); throw error; }
  finally {
    if (supervisor.connected) supervisor.send({ type: 'studio:shutdown' });
    const timer = setTimeout(() => require('../src/services/processTermination').terminateChild(supervisor), 50000);
    await exited;
    clearTimeout(timer);
    fs.rmSync(spec.root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
