'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const policy = require('../src/services/sreHealingPolicyService');
const store = require('../src/services/sreHealingStoreService');

async function database() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec('PRAGMA foreign_keys=ON');
  return db;
}

function detected() {
  return policy.detectProductionDrift({ organizationId: 'org-1', projectId: 'project-1',
    serviceId: 'checkout', responsibilityAgentId: 'sre-checkout',
    now: '2026-10-19T10:10:00.000Z', observations: [1, 2, 3].map((id) => ({
      occurredAt: `2026-10-19T10:0${id + 5}:00.000Z`, value: 140 + id,
      baseline: 100, sourceRef: `otel://latency/${id}` })) });
}

test('persists responsibility and an immutable initial receipt', async () => {
  const db = await database();
  try {
    const snapshot = detected();
    const created = await store.createCampaign(db,
      { snapshot, occurredAt: '2026-10-19T10:10:00.000Z' });
    assert.equal(created.version, 1);
    const receipts = await store.listReceipts(db,
      { ...snapshot.scope, campaignId: snapshot.campaignId });
    assert.equal(receipts.length, 1);
    await assert.rejects(db.run(`UPDATE sre_healing_campaigns
      SET responsibility_agent_id='other' WHERE campaign_id=?`, snapshot.campaignId));
  } finally { await db.close(); }
});

test('appends hash-linked transitions with optimistic concurrency', async () => {
  const db = await database();
  try {
    const snapshot = detected();
    const created = await store.createCampaign(db,
      { snapshot, occurredAt: '2026-10-19T10:10:00.000Z' });
    const next = { ...snapshot, status: 'INVESTIGATING', decision: 'GATHER_EVIDENCE' };
    const advanced = await store.appendTransition(db, { snapshot: next,
      expectedVersion: created.version, occurredAt: '2026-10-19T10:11:00.000Z' });
    assert.equal(advanced.version, 2);
    const receipts = await store.listReceipts(db,
      { ...snapshot.scope, campaignId: snapshot.campaignId });
    assert.equal(receipts[1].previous_receipt_id, receipts[0].receipt_id);
    await assert.rejects(store.appendTransition(db, { snapshot: next,
      expectedVersion: 1, occurredAt: '2026-10-19T10:12:00.000Z' }),
    { code: 'SRE_STORE_VERSION_CONFLICT' });
  } finally { await db.close(); }
});

test('refuses implicit responsibility reassignment and receipt mutation', async () => {
  const db = await database();
  try {
    const snapshot = detected();
    await store.createCampaign(db, { snapshot, occurredAt: '2026-10-19T10:10:00.000Z' });
    const reassigned = { ...snapshot, status: 'INVESTIGATING',
      scope: { ...snapshot.scope, responsibilityAgentId: 'replacement' } };
    await assert.rejects(store.appendTransition(db, { snapshot: reassigned,
      expectedVersion: 1, occurredAt: '2026-10-19T10:11:00.000Z' }),
    { code: 'SRE_STORE_RESPONSIBILITY_INVALID' });
    await assert.rejects(db.run('DELETE FROM sre_healing_receipts'));
  } finally { await db.close(); }
});
