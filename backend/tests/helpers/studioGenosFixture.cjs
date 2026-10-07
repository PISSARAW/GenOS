'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const fixture = require('./b06ClientFixture.cjs');

async function withFixture(probe) {
  const spec = await fixture.prepare();
  const server = http.createServer();
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    spec.url = spec.settings.url = `http://127.0.0.1:${server.address().port}`;
    process.env.GENOS_ALLOWED_ORIGINS = spec.url;
    server.on('request', require('../../src/app').createApp());
    return await probe(spec);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await require('../../src/db').closeDatabase();
    if (!path.basename(spec.root).startsWith('genos-b06-clients-')) throw new Error('Unexpected cleanup root');
    fs.rmSync(spec.root, { recursive: true, force: true });
  }
}

async function writeRefusals(spec, route) {
  const assert = require('node:assert/strict');
  const { request } = require('./studioRequest.cjs');
  await spec.db.run("UPDATE access_keys SET role = 'viewer' WHERE id = 'b06-key'");
  assert.equal((await request(spec, route, { body: {} })).status, 403);
  await spec.db.run("UPDATE access_keys SET role = 'operator' WHERE id = 'b06-key'");
  await spec.db.run("UPDATE projects SET status = 'archived' WHERE id = 'b06-project'");
  assert.equal((await request(spec, route, { body: {} })).status, 409);
  await spec.db.run("UPDATE projects SET status = 'active' WHERE id = 'b06-project'");
  await spec.db.run("UPDATE project_memberships SET role = 'viewer' WHERE project_id = 'b06-project'");
  assert.equal((await request(spec, route, { body: {} })).status, 403);
  await spec.db.run("UPDATE project_memberships SET role = 'member' WHERE project_id = 'b06-project'");
}

module.exports = { withFixture, writeRefusals };
