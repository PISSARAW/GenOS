'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const runtime = require('../src/services/daemon/residentDaemonRuntime');

async function openDb() {
  const sqlite = require('sqlite');
  const sqlite3 = require('sqlite3');
  const db = await sqlite.open({ filename: ':memory:', driver: sqlite3.Database });
  return {
    run: (sql, ...args) => db.run(sql, ...args),
    get: (sql, ...args) => db.get(sql, ...args),
    all: (sql, ...args) => db.all(sql, ...args),
    exec: (sql) => db.exec(sql),
    close: () => db.close()
  };
}

async function main() {
  // 1. Transitions déterministes du lifecycle
  assert.equal(runtime.transitionActivity('BOOTSTRAPPING', 'surveyed'), 'SURVEYING');
  assert.equal(runtime.transitionActivity('SURVEYING', 'complete'), 'DORMANT');
  assert.equal(runtime.transitionActivity('DORMANT', 'signal'), 'FOCUSED');
  assert.equal(runtime.transitionActivity('FOCUSED', 'investigate'), 'INVESTIGATING');
  assert.equal(runtime.transitionActivity('INVESTIGATING', 'verify'), 'VERIFYING');
  assert.equal(runtime.transitionActivity('VERIFYING', 'report'), 'REPORTING');
  assert.equal(runtime.transitionActivity('REPORTING', 'done'), 'DORMANT');
  assert.equal(runtime.transitionActivity('DORMANT', 'bogus'), null);

  // 2. Génome résident existe et respecte le contrat d'autorité
  const genomePath = path.join(__dirname, '..', '..', 'agents', 'daemons', 'resident_daemon.agent.json');
  const genome = JSON.parse(fs.readFileSync(genomePath, 'utf8'));
  assert.equal(genome.kind, 'AgentGenome');
  assert.equal(genome.identity.role, 'resident_daemon');
  assert.equal(genome.authority.filesystem_write, false);
  assert.equal(genome.authority.git_push, false);
  assert.equal(genome.authority.merge, false);
  assert.ok(genome.cognition.organelles.includes('cartography'));
  assert.ok(!JSON.stringify(genome.capabilities).toLowerCase().includes('push branch'));

  // 3. Register + heartbeat en mémoire et SQLite
  const db = await openDb();
  const rt = runtime.createRuntime(db, {});
  assert.equal(rt.genomeRef, runtime.GENOME_REF);
  const reg = await runtime.registerDaemon(rt, { daemonId: 'daemon.resident-1', territoryId: 'territory.genos-backend' });
  assert.equal(reg.registered, true);
  assert.equal(reg.activity, 'BOOTSTRAPPING');

  const beat = await runtime.heartbeat(rt, { daemonId: 'daemon.resident-1', activity: 'DORMANT', health: 'HEALTHY' });
  assert.equal(beat.updated, true);
  assert.equal(beat.activity, 'DORMANT');
  assert.equal(beat.revisions, 0);

  // 4. Révision cognitive Hayflick : seulement sur flag explicite
  const revised = await runtime.heartbeat(rt, { daemonId: 'daemon.resident-1', revision: true });
  assert.equal(revised.revisions, 1);
  const row = await db.get('SELECT cognitive_revisions FROM daemon_runtime_state WHERE daemon_id = ?', 'daemon.resident-1');
  assert.equal(row.cognitive_revisions, 1);

  // 5. Daemon inconnu : échec doux, pas de throw
  const unknown = await runtime.heartbeat(rt, { daemonId: 'daemon.ghost' });
  assert.equal(unknown.updated, false);

  // 6. getDaemonState mémoire puis SQLite
  const mem = await runtime.getDaemonState(rt, { daemonId: 'daemon.resident-1' });
  assert.equal(mem.found, true);
  assert.equal(mem.source, 'memory');
  const rt2 = runtime.createRuntime(db, {});
  const persisted = await runtime.getDaemonState(rt2, { daemonId: 'daemon.resident-1' });
  assert.equal(persisted.found, true);
  assert.equal(persisted.source, 'sqlite');

  await db.close();
  console.log('Resident daemon runtime tests passed (lifecycle, genome authority, heartbeat, Hayflick).');
}

main().catch((error) => { console.error(error); process.exit(1); });
