'use strict';
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { withFixture, writeRefusals } = require('./helpers/studioGenosFixture.cjs');
const { request } = require('./helpers/studioRequest.cjs');

async function probe(spec) {
  const base = '/api/studio/agents/consumer-promotion-agent';
  const row = await request(spec, base + '/diagnostic');
  assert.equal(row.status, 200);
  assert.equal(row.value.agent.processAlive, null);
  assert.equal(row.value.diagnosisEstablished, false);
  assert.equal(row.value.nativeVerification.status, 'not_evaluated');
  assert.equal((await request(spec, base + '/diagnostic', { project: 'b06-other' })).status, 404);
  await spec.db.run("UPDATE access_keys SET role = 'admin' WHERE id = 'b06-key'");
  assert.equal((await fetch(spec.url + base + '/diagnostic', { headers: { Authorization: 'Bearer ' + spec.token } })).status, 403);
  await spec.db.run("UPDATE access_keys SET role = 'operator' WHERE id = 'b06-key'");
  assert.equal((await request(spec, base + '/stop', { body: {} })).status, 409);
  const refused = await request(spec, base + '/stop', { body: { confirmed: true } });
  assert.equal(refused.status, 409);
  assert.equal(refused.value.error.code, 'EXTERNAL_RUNTIME_UNVERIFIED');
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {},1000)'], { stdio: 'ignore', windowsHide: true });
  const state = require('../src/services/agentOrchestrationState');
  try {
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    state.activeProcesses.set(spec.settings.agent, child);
    child.once('exit', () => state.activeProcesses.delete(spec.settings.agent));
    assert.equal((await request(spec, base + '/diagnostic')).value.agent.processAlive, true);
    const stopped = await request(spec, base + '/stop', { body: { confirmed: true }, timeoutMs: 20000 });
    assert.equal(stopped.status, 200);
    assert.equal(stopped.value.confirmed, true);
    assert.equal(require('../src/services/garageProcessControl').pidAlive(child.pid), false);
    assert.equal((await spec.db.get('SELECT status FROM agents WHERE id = ?', spec.settings.agent)).status, 'idle');
    await writeRefusals(spec, base + '/stop');
    console.log('Studio recovery: scoped diagnostics, unknown/native states, confirmation/external refusal and real managed PID disappearance passed.');
  } finally {
    if (require('../src/services/garageProcessControl').pidAlive(child.pid)) child.kill();
    state.activeProcesses.delete(spec.settings.agent);
  }
}
withFixture(probe).catch(error => { console.error(error); process.exitCode = 1; });
