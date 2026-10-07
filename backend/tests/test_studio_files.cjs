'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const fixture = require('./helpers/b06ClientFixture.cjs');

async function request(spec, route, settings = {}) {
  const response = await fetch(spec.url + route, { method: settings.method || 'GET',
    headers: { Authorization: `Bearer ${spec.token}`, 'X-Organization-Id': 'b06-org',
      'X-Project-Id': settings.project || 'b06-project', 'Content-Type': 'application/json' },
    body: settings.body ? JSON.stringify(settings.body) : undefined });
  return { status: response.status, value: await response.json() };
}

async function main() {
  const spec = await fixture.prepare();
  const server = require('../src/app').createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  spec.url = `http://127.0.0.1:${server.address().port}`;
  const base = '/api/workspaces/consumer-ws';
  const route = base + '/file?path=studio-test.html';
  const original = '<div>preuve é</div>\n';
  const options = (version, content) => ({ method: 'PUT', body: { version, contentBase64: Buffer.from(content).toString('base64') } });
  try {
    const created = await request(spec, route, options('missing', original));
    assert.equal(created.status, 200, JSON.stringify(created.value));
    assert.equal((await request(spec, route)).value.content, original);
    const snapshot = await request(spec, base + '/snapshots', { method: 'POST', body: { label: 'Before edit', reason: 'Test' } });
    assert.equal(snapshot.status, 201);
    const attempts = await Promise.all([
      request(spec, route, options(created.value.version, '<div>first</div>')),
      request(spec, route, options(created.value.version, '<div>second</div>'))
    ]);
    assert.deepEqual(attempts.map(item => item.status).sort(), [200, 409]);
    assert.equal((await request(spec, route, { project: 'b06-other' })).status, 404);
    assert.equal((await request(spec, base + '/file?path=.env')).status, 403);
    assert.equal((await request(spec, base + '/file?path=..%2Foutside')).status, 400);
    const list = await request(spec, base + '/editor-files');
    assert.ok(list.value.files.some(item => item.path === 'studio-test.html'));
    const restored = await request(spec, base + '/restore', { method: 'POST', body: { snapshotId: snapshot.value.id || snapshot.value.snapshot?.id } });
    assert.equal(restored.status, 200, JSON.stringify(restored.value));
    assert.equal((await request(spec, route)).value.content, original);
    const workspace = await spec.db.get("SELECT path FROM workspaces WHERE id='consumer-ws'");
    assert.equal(fs.readFileSync(path.join(workspace.path, 'studio-test.html'), 'utf8'), original);
    console.log('Studio files: exact HTML/UTF-8, concurrent conflict, tenant/path refusals and durable restoration passed.');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await require('../src/db').closeDatabase();
    fs.rmSync(spec.root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
