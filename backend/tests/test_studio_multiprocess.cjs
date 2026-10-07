'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fork } = require('node:child_process');
const fixture = require('./helpers/b06ClientFixture.cjs');
const { request } = require('./helpers/studioRequest.cjs');

async function start(spec) {
  const child = fork(path.join(__dirname, 'helpers/studioFileServer.cjs'), [], {
    windowsHide: true, stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    env: { ...process.env, GENOS_DB_PATH: spec.filename, GENOS_DB_BOOTSTRAP_SKIP: '1',
      GENOS_DB_BACKUP_SKIP: '1', GENOS_SCHEMA_MAINTENANCE: '0', GENOS_RUNTIME_MAINTENANCE: '0' }
  });
  const exited = new Promise(resolve => child.once('exit', resolve));
  const ready = await new Promise((resolve, reject) => {
    child.once('message', resolve);
    child.once('error', reject);
    child.once('exit', code => reject(new Error('File server exited: ' + code)));
  });
  return { child, exited, url: ready.url };
}

async function main() {
  const spec = await fixture.prepare();
  const servers = [];
  try {
    servers.push(await start(spec));
    servers.push(await start(spec));
    const route = '/api/workspaces/consumer-ws/file?path=two-processes.txt';
    const created = await request({ ...spec, url: servers[0].url }, route, { method: 'PUT',
      body: { version: 'missing', contentBase64: Buffer.from('baseline').toString('base64') } });
    assert.equal(created.status, 200);
    const writes = await Promise.all(servers.map((server, index) => request({ ...spec, url: server.url }, route,
      { method: 'PUT', body: { version: created.value.version, contentBase64: Buffer.from('writer-' + index).toString('base64') } })));
    assert.deepEqual(writes.map(item => item.status).sort(), [200, 409]);
    const read = await request({ ...spec, url: servers[1].url }, route);
    const successful = writes.findIndex(item => item.status === 200);
    assert.equal(read.value.content, 'writer-' + successful);
    console.log('Studio multiprocess: two real backend processes, one shared SQLite/file, exactly one CAS winner passed.');
  } finally {
    for (const server of servers) if (server.child.connected) server.child.send({ type: 'close' });
    await Promise.all(servers.map(server => server.exited));
    await require('../src/db').closeDatabase();
    fs.rmSync(spec.root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
