'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();
const { applyV45Migration } = require('../src/db/schema-next');
const delivery = require('../src/services/signalDeliveryService');
const inbox = require('../src/services/signalInboxService');

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await db.exec(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
      CREATE TABLE agents (id TEXT PRIMARY KEY, workspace_id TEXT);
      INSERT INTO workspaces VALUES ('ws-a', 'org-a', 'proj-a'), ('ws-b', 'org-b', 'proj-b');
      INSERT INTO agents VALUES ('sender-a', 'ws-a'), ('reader-a', 'ws-a'), ('sender-b', 'ws-b');`);
    await applyV45Migration(db);
    const scope = { organizationId: 'org-a', projectId: 'proj-a' };
    assert.equal(await delivery.subscribeAgent(db, 'reader-a', { topic: 'ready', filter: { role: 'x' } }), false);
    assert.equal(await delivery.subscribeAgent(db, 'reader-a', 'ready'), true);
    assert.equal(await delivery.unsubscribeAgent(db, 'reader-a', 'ready'), true);
    assert.equal(await delivery.unsubscribeAgent(db, 'reader-a', 'ready'), false);
    await db.run(`INSERT INTO signal_blobs (signal_id, signal_type, sender_agent_id)
      VALUES ('signal-a', 'ligand', 'sender-a'), ('signal-b', 'ligand', 'sender-b')`);
    await db.run(`INSERT INTO signal_deliveries (signal_id, subscriber_agent_id)
      VALUES ('signal-a', 'reader-a'), ('signal-b', 'reader-a')`);
    assert.equal(await delivery.ackDelivery(db, { signalId: 'signal-a', subscriberAgentId: 'reader-a' }), false,
      'pending is not an acknowledgement');
    assert.equal(await delivery.markDelivered(db, { signalId: 'signal-a', subscriberAgentId: 'reader-a' }), true);
    assert.equal(await delivery.markDelivered(db, { signalId: 'signal-b', subscriberAgentId: 'reader-a' }), true);
    const visible = await inbox.readDeliveredInbox(db, scope, { agentId: 'reader-a' });
    assert.deepEqual(visible.map((item) => item.signalId), ['signal-a']);
    assert.equal(await inbox.ackScopedDelivery(db, scope, { signalId: 'signal-b', agentId: 'reader-a' }), false,
      'a cross-scope sender cannot be acknowledged');
    assert.equal(await inbox.ackScopedDelivery(db, scope, { signalId: 'signal-a', agentId: 'reader-a' }), true);
    assert.equal(await inbox.ackScopedDelivery(db, scope, { signalId: 'signal-a', agentId: 'reader-a' }), false);
    assert.equal((await inbox.readDeliveredInbox(db, scope, { agentId: 'reader-a' })).length, 0);
    console.log('signal delivery API contract passed');
  } finally {
    await db.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
