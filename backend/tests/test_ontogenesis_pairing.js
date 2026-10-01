'use strict';

const assert = require('assert');

async function memoryDb() {
  const sqlite3 = require('sqlite3');
  const { open } = require('sqlite');
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const { migrateOntogenesis } = require('../src/db/migrations/migrateOntogenesis');
  const { migrateOntogenesisHosts } = require('../src/db/migrations/migrateOntogenesisHosts');
  await migrateOntogenesis(db);
  await migrateOntogenesisHosts(db);
  return db;
}

(async () => {
  const pairing = require('../src/services/ontogenesis/pairingService');

  const db = await memoryDb();
  await assert.rejects(pairing.createPairing(db, { projectId: 'p1', role: 'satellite', endpoint: 'x' }), /role-hote-inconnu/);

  // Cycle : code → appairage → heartbeat.
  const created = await pairing.createPairing(db, { projectId: 'p1', role: 'controller', endpoint: 'https://farm-1' });
  assert.ok(created.code && created.expiresAt);
  const claimed = await pairing.claimPairing(db, { projectId: 'p1', code: created.code });
  assert.strictEqual(claimed.role, 'controller');
  await assert.rejects(pairing.claimPairing(db, { projectId: 'p1', code: created.code }), /code-inconnu/);
  const beat = await pairing.heartbeat(db, { projectId: 'p1', endpoint: 'https://farm-1' });
  assert.strictEqual(beat.hostId, claimed.hostId);
  assert.strictEqual(await pairing.heartbeat(db, { projectId: 'p1', endpoint: 'https://fantome' }), null);

  // Code expiré refusé.
  const stale = await pairing.createPairing(db, { projectId: 'p1', role: 'worker', endpoint: 'w-1', ttlMs: 60000 });
  const future = new Date(Date.now() + 3600000).toISOString();
  await assert.rejects(pairing.claimPairing(db, { projectId: 'p1', code: stale.code, nowIso: future }), /code-expire/);

  // Une seule machine locale à la fois : la seconde retire la première.
  const first = await pairing.createPairing(db, { projectId: 'p1', role: 'local', endpoint: 'pc-bureau' });
  await pairing.claimPairing(db, { projectId: 'p1', code: first.code });
  const second = await pairing.createPairing(db, { projectId: 'p1', role: 'local', endpoint: 'pc-portable' });
  await pairing.claimPairing(db, { projectId: 'p1', code: second.code });
  const hosts = await pairing.listHosts(db, 'p1');
  const byEndpoint = new Map(hosts.map((host) => [host.endpoint, host.status]));
  assert.strictEqual(byEndpoint.get('pc-bureau'), 'retired');
  assert.strictEqual(byEndpoint.get('pc-portable'), 'paired');

  console.log('ontogenesis pairing checks passed.');
})().catch((error) => { console.error(error); process.exit(1); });
