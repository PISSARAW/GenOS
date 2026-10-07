'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fixture = require('./helpers/b06ClientFixture.cjs');

async function request(spec, route, body) {
  const response = await fetch(spec.url + route, { method: 'POST',
    headers: { Authorization: `Bearer ${spec.token}`, 'X-Organization-Id': 'b06-org',
      'X-Project-Id': 'b06-project', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, value: await response.json() };
}

async function main() {
  const spec = await fixture.prepare();
  const server = require('../src/app').createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  spec.url = `http://127.0.0.1:${server.address().port}`;
  try {
    await spec.db.run("INSERT INTO workspaces (id,name,path,organization_id,project_id) VALUES ('foreign-ws','Foreign',?,'b06-org','b06-other')", spec.root);
    await spec.db.run("INSERT INTO agents (id,name,role,status,workspace_id) VALUES ('foreign-agent','PRIVATE_SENTINEL','worker','running','foreign-ws')");
    const list = await request(spec, '/api/terminal', { command: 'agents' });
    assert.equal(list.status, 200);
    assert.doesNotMatch(list.value.output, /PRIVATE_SENTINEL/);
    assert.equal((await request(spec, '/api/terminal', { command: 'halt' })).status, 403);
    const fork = await request(spec, '/api/command', { action: 'fork_agent', agentId: 'consumer-promotion-agent' });
    assert.equal(fork.status, 201, JSON.stringify(fork.value));
    assert.ok(await spec.db.get('SELECT id FROM agents WHERE id=? AND workspace_id=?', fork.value.clonedAgentId, 'consumer-ws'));
    assert.equal((await request(spec, '/api/command', { action: 'fork_agent', agentId: 'foreign-agent' })).status, 404);
    const organization = await request(spec, '/api/control-plane/organizations', { name: 'Studio isolated organization' });
    assert.equal(organization.status, 201);
    assert.ok(await spec.db.get('SELECT id FROM organizations WHERE id=?', organization.value.id));
    console.log('Studio management: scoped terminal, global control refusal, real fork and organization persistence passed.');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await require('../src/db').closeDatabase();
    fs.rmSync(spec.root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
