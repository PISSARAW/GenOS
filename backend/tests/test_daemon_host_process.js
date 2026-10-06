'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { fixture, closeFixture } = require('./helpers/daemonCompletionFixture');
const bridge = require('../src/services/daemon/daemonEventBridgeService');

function launch(value) {
  const child = spawn(process.execPath, [path.join(__dirname, '../bin/genos-daemon.cjs'),
    '--territory', value.context.territoryId, '--daemon-id', value.context.daemonId], {
    windowsHide: true, env: { ...process.env, GENOS_DB_PATH: value.databasePath,
      GENOS_DB_BOOTSTRAP_SKIP: '1' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  const host = { child, output: '', closed: false };
  const append = (chunk) => { host.output = (host.output + chunk).slice(-32768); };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  host.completion = new Promise((resolve) => child.once('close', () => { host.closed = true; resolve(); }));
  return host;
}

async function waitFor(host, condition) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (host.closed) throw new Error('Host exited unexpectedly: ' + host.output);
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Host did not reach the expected state: ' + host.output);
}

async function stop(host) {
  if (!host || host.closed) return;
  host.child.kill('SIGTERM');
  await host.completion;
}

async function observedState(value) {
  return value.db.get(`SELECT runtime.activity, runtime.cognitive_revisions, cursor.last_event_id
    FROM daemon_runtime_state runtime JOIN daemon_event_cursors cursor ON cursor.daemon_id = runtime.daemon_id
    WHERE runtime.daemon_id = ?`, value.context.daemonId);
}

async function main() {
  assert.ok(process.env.GENOS_DB_PATH, 'Run through the isolated daemon suite');
  const databasePath = path.resolve(process.env.GENOS_DB_PATH);
  const temporaryRoot = path.resolve(require('node:os').tmpdir()) + path.sep;
  assert.ok(databasePath.startsWith(temporaryRoot) && path.basename(path.dirname(databasePath)).startsWith('genos-daemon-suite-'), 'Temporary suite database required');
  const value = await fixture(databasePath);
  value.databasePath = databasePath;
  let host;
  try {
    host = launch(value);
    await waitFor(host, () => host.output.includes(' active on '));
    assert.equal((await observedState(value)).activity, 'DORMANT');
    const producer = bridge.createBridge({ db: value.db });
    await bridge.ingestEvent(producer, { territoryId: value.context.territoryId,
      type: 'TERRITORY_FILE_CHANGED', payload: { files: ['probe.js'] } });
    await waitFor(host, async () => {
      const state = await observedState(value);
      const finding = await value.db.get('SELECT id FROM daemon_findings WHERE territory_id = ?', value.context.territoryId);
      return state?.last_event_id > 0 && state.activity === 'DORMANT' && Boolean(finding);
    });
    const before = await observedState(value);
    assert.equal(before.cognitive_revisions, 0);
    await stop(host);
    host = launch(value);
    await waitFor(host, () => host.output.includes(' active on '));
    const after = await observedState(value);
    assert.equal(after.last_event_id, before.last_event_id);
    assert.equal(after.cognitive_revisions, before.cognitive_revisions);
    assert.equal(after.activity, 'DORMANT');
    console.log('Actual resident process: liveness, interprocess delivery, persisted cursor and restart passed.');
  } finally {
    await stop(host);
    await closeFixture(value);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
