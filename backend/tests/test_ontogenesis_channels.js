'use strict';

const assert = require('assert');

async function memoryDb() {
  const sqlite3 = require('sqlite3');
  const { open } = require('sqlite');
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const { migrateOntogenesis } = require('../src/db/migrations/migrateOntogenesis');
  const { migrateOntogenesisChannels } = require('../src/db/migrations/migrateOntogenesisChannels');
  await migrateOntogenesis(db);
  await migrateOntogenesisChannels(db);
  return db;
}

(async () => {
  const channels = require('../src/services/ontogenesis/channelService');

  // Enregistrement validé, doublon = mise à jour idempotente.
  const db = await memoryDb();
  await assert.rejects(channels.registerChannel(db, { projectId: 'p1', channel: 'pigeon', direction: 'out' }), /canal-inconnu/);
  await assert.rejects(channels.registerChannel(db, { projectId: 'p1', channel: 'cli', direction: 'sideways' }), /direction-inconnue/);
  await channels.registerChannel(db, { projectId: 'p1', channel: 'cli', direction: 'out' });
  await channels.registerChannel(db, { projectId: 'p1', channel: 'slack', direction: 'out' });
  await channels.registerChannel(db, { projectId: 'p1', channel: 'slack', direction: 'in' });
  await channels.registerChannel(db, { projectId: 'p1', channel: 'teams', direction: 'out', enabled: false });
  assert.strictEqual((await channels.listChannels(db, 'p1')).length, 4);

  // Routage : décisions partout, routine sur le canal local.
  const out = await channels.listChannels(db, 'p1', 'out');
  assert.deepStrictEqual(channels.routesFor('decision_needed', out), ['cli', 'slack']);
  assert.deepStrictEqual(channels.routesFor('result', out), ['cli']);
  assert.deepStrictEqual(channels.routesFor('blocked', out), ['cli']);
  const routed = await channels.dispatchRoutes(db, { projectId: 'p1', kind: 'decision_needed' });
  assert.deepStrictEqual(routed, { kind: 'decision_needed', routes: ['cli', 'slack'] });

  // Sans cli : repli sur le premier canal actif ; sans canal : silence.
  const rows = [{ channel: 'slack', direction: 'out', enabled: 1 }];
  assert.deepStrictEqual(channels.routesFor('result', rows), ['slack']);
  assert.deepStrictEqual(channels.routesFor('result', []), []);
  const empty = await channels.dispatchRoutes(db, { projectId: 'vide', kind: 'result' });
  assert.deepStrictEqual(empty.routes, []);

  console.log('ontogenesis channels checks passed.');
})().catch((error) => { console.error(error); process.exit(1); });
