'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();
const { migrateSignalDeliveryClaims } = require('../src/db/migrations/migrateSignalDeliveryClaims');
const { claimPendingDelivery, completeClaimedDelivery, releaseDeliveryClaim } = require('../src/services/signalDeliveryService');

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await db.exec(`CREATE TABLE signal_deliveries (
      signal_id TEXT NOT NULL, subscriber_agent_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      delivered_at TEXT, PRIMARY KEY (signal_id, subscriber_agent_id));`);
    await migrateSignalDeliveryClaims(db);
    await db.run("INSERT INTO signal_deliveries (signal_id, subscriber_agent_id) VALUES ('sig-1', 'agent-1')");
    const claimInput = { signalId: 'sig-1', subscriberAgentId: 'agent-1', leaseMs: 1000 };
    assert.equal(await claimPendingDelivery(db, { ...claimInput, owner: 'attempt-a', now: 1000 }), true);
    assert.equal(await claimPendingDelivery(db, { ...claimInput, owner: 'attempt-b', now: 1999 }), false);
    assert.equal(await claimPendingDelivery(db, { ...claimInput, owner: 'attempt-b', now: 2000 }), true);
    assert.equal(await completeClaimedDelivery(db, {
      signalId: 'sig-1', subscriberAgentId: 'agent-1', owner: 'attempt-a', now: 2001
    }), false, 'an expired owner cannot complete a reclaimed delivery');
    assert.equal(await completeClaimedDelivery(db, {
      signalId: 'sig-1', subscriberAgentId: 'agent-1', owner: 'attempt-b', now: 2001
    }), true);
    const row = await db.get("SELECT status FROM signal_deliveries WHERE signal_id = 'sig-1'");
    assert.equal(row.status, 'delivered');

    await db.run("INSERT INTO signal_deliveries (signal_id, subscriber_agent_id) VALUES ('sig-2', 'agent-1')");
    const retry = { signalId: 'sig-2', subscriberAgentId: 'agent-1', owner: 'attempt-c', now: 3000, leaseMs: 1000 };
    assert.equal(await claimPendingDelivery(db, retry), true);
    assert.equal(await releaseDeliveryClaim(db, { ...retry, error: 'temporary failure' }), true);
    assert.equal(await claimPendingDelivery(db, { ...retry, owner: 'attempt-d', now: 3499 }), false,
      'retry backoff blocks early redelivery');
    assert.equal(await claimPendingDelivery(db, { ...retry, owner: 'attempt-d', now: 3500 }), true,
      'delivery becomes claimable when retry backoff expires');
    console.log('Signal delivery claim tests passed.');
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
