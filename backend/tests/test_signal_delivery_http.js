'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();
const { applyV45Migration } = require('../src/db/schema-next');
const dbIndex = require('../src/db');
const iam = require('../src/services/iamPolicyEngine');

async function setupDb() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`CREATE TABLE projects (id TEXT PRIMARY KEY, organization_id TEXT, status TEXT);
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    CREATE TABLE agents (id TEXT PRIMARY KEY, workspace_id TEXT);
    INSERT INTO projects VALUES ('proj-a', 'org-a', 'active'), ('proj-b', 'org-b', 'active');
    INSERT INTO workspaces VALUES ('ws-a', 'org-a', 'proj-a'), ('ws-b', 'org-b', 'proj-b');
    INSERT INTO agents VALUES ('sender-a', 'ws-a'), ('reader-a', 'ws-a'), ('sender-b', 'ws-b');`);
  await applyV45Migration(db);
  return db;
}

async function main() {
  const db = await setupDb();
  const originalGetDatabase = dbIndex.getDatabase;
  const originalAuthorize = iam.authorize;
  dbIndex.getDatabase = async () => db;
  iam.authorize = async () => ({ allowed: true });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { isAuthenticated: true, role: 'admin', permissions: ['all'], keyId: 'test-admin' };
    next();
  });
  app.use('/api/signals', require('../src/routes/signalDeliveryRoutes'));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/signals`;
  const scopeHeaders = { 'X-Organization-Id': 'org-a', 'X-Project-Id': 'proj-a' };
  async function request(path, method = 'GET', body = null) {
    const response = await fetch(`${base}${path}`, { method,
      headers: { ...scopeHeaders, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json() };
  }
  try {
    assert.equal((await request('/subscriptions', 'POST', { agentId: 'reader-a', topic: 'ready' })).status, 200);
    assert.equal((await request('/subscriptions', 'POST', { agentId: 'sender-b', topic: 'ready' })).status, 404);
    await db.run(`INSERT INTO signal_blobs (signal_id, signal_type, topic, sender_agent_id)
      VALUES ('sig-a', 'ligand', 'ready', 'sender-a'), ('sig-b', 'ligand', 'ready', 'sender-b')`);
    await db.run(`INSERT INTO signal_deliveries (signal_id, subscriber_agent_id)
      VALUES ('sig-a', 'reader-a'), ('sig-b', 'reader-a')`);
    assert.equal((await request('/deliveries/sig-a/ack', 'POST', { agentId: 'reader-a' })).status, 409);
    await db.run("UPDATE signal_deliveries SET status = 'delivered' WHERE subscriber_agent_id = 'reader-a'");
    const inbox = await request('/inbox/reader-a');
    assert.equal(inbox.status, 200);
    assert.deepEqual(inbox.body.signals.map((signal) => signal.signalId), ['sig-a']);
    assert.equal((await db.get("SELECT status FROM signal_deliveries WHERE signal_id = 'sig-a'")).status, 'seen');
    assert.equal((await request('/deliveries/sig-b/ack', 'POST', { agentId: 'reader-a' })).status, 409);
    assert.equal((await request('/deliveries/sig-a/ack', 'POST', { agentId: 'reader-a' })).status, 200);
    assert.equal((await request('/deliveries/sig-a/ack', 'POST', { agentId: 'reader-a' })).status, 409);
    await db.run("UPDATE projects SET status = 'archived' WHERE id = 'proj-a'");
    assert.equal((await request('/inbox/reader-a')).status, 409);
    console.log('signal delivery HTTP routes passed');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    dbIndex.getDatabase = originalGetDatabase;
    iam.authorize = originalAuthorize;
    await db.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
