'use strict';

const assert = require('assert');

async function memoryDb() {
  const sqlite3 = require('sqlite3');
  const { open } = require('sqlite');
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const { migrateOntogenesis } = require('../src/db/migrations/migrateOntogenesis');
  const { migrateOntogenesisConversation } = require('../src/db/migrations/migrateOntogenesisConversation');
  const { migrateOntogenesisSchedule } = require('../src/db/migrations/migrateOntogenesisSchedule');
  const { migrateOntogenesisQuestions } = require('../src/db/migrations/migrateOntogenesisQuestions');
  await migrateOntogenesis(db);
  await migrateOntogenesisConversation(db);
  await migrateOntogenesisSchedule(db);
  await migrateOntogenesisQuestions(db);
  return db;
}

(async () => {
  const ritual = require('../src/services/ontogenesis/ritualService');
  const store = require('../src/services/ontogenesis/projectStore');
  const { tickOnce } = require('../src/services/ontogenesis/tickService');

  // Chambres : unanimité sur action saine, dissentiment sur irréversible.
  const clean = ritual.evaluateChambers(
    { scope: 'edit', branch: 'codex/ontogenesis' },
    { failures: [], budgetsOk: true, reversibility: 'reversible' }
  );
  assert.ok(ritual.isUnanimous(clean));
  const risky = ritual.evaluateChambers(
    { scope: 'commit', branch: 'codex/ontogenesis' },
    { failures: [], budgetsOk: true, reversibility: 'irreversible' }
  );
  assert.strictEqual(ritual.isUnanimous(risky), false);
  assert.ok(risky.some((chamber) => chamber.verdict === 'handoff'));
  const broke = ritual.evaluateChambers(
    { scope: 'edit', branch: 'codex/ontogenesis' },
    { failures: [{}, {}], budgetsOk: false, reversibility: 'reversible' }
  );
  assert.ok(broke.every((chamber) => chamber.verdict !== 'proceed'));

  const db = await memoryDb();
  const memory = require('../src/services/ontogenesis/memoryService');
  // Sans autorité configurée : la review refuse, le rituel s'ouvre.
  const pid = await store.createProject(db, { rootPath: 'C:/proj', branch: 'codex/ontogenesis', objective: 'rituel' });
  const task = await store.addTask(db, { projectId: pid, title: 'sensible', priority: 1 });
  const opened = await tickOnce(db, { projectId: pid, owner: 'runner-1' });
  assert.strictEqual(opened.state, 'PLANNING');
  // Deux échecs en mémoire : les chambres ne peuvent plus être unanimes.
  await memory.recordMemory(db, { projectId: pid, kind: 'failure', content: 'f1', provenance: {} });
  await memory.recordMemory(db, { projectId: pid, kind: 'failure', content: 'f2', provenance: {} });
  const second = await tickOnce(db, { projectId: pid, owner: 'runner-1' });
  assert.strictEqual(second.note, 'rituel-en-cours');

  // Le tick suivant clôt : dissentiment transmis avec dossier.
  const third = await tickOnce(db, { projectId: pid, owner: 'runner-1' });
  assert.strictEqual(third.note, 'rituel-transmis-operateur');
  const fourth = await tickOnce(db, { projectId: pid, owner: 'runner-1' });
  assert.strictEqual(fourth.note, 'attente-approbation');

  // Approbation → voie libre vers le harnais ; refus → tâche bloquée.
  const approvals = await db.all('SELECT * FROM ontogenesis_approval_requests WHERE project_id = ?', [pid]);
  assert.strictEqual(approvals.length, 1);
  assert.strictEqual(approvals[0].status, 'pending');
  await db.run(`UPDATE ontogenesis_approval_requests SET status = 'approved' WHERE id = ?`, [approvals[0].id]);
  const cleared = await tickOnce(db, { projectId: pid, owner: 'runner-1' });
  assert.strictEqual(cleared.note, 'dispatch-requiert-harnais');

  const pid2 = await store.createProject(db, { rootPath: 'C:/autre', branch: 'codex/ontogenesis', objective: 'refus' });
  const task2 = await store.addTask(db, { projectId: pid2, title: 'risquee', priority: 1 });
  await memory.recordMemory(db, { projectId: pid2, kind: 'failure', content: 'f1', provenance: {} });
  await memory.recordMemory(db, { projectId: pid2, kind: 'failure', content: 'f2', provenance: {} });
  await tickOnce(db, { projectId: pid2, owner: 'runner-1' });
  await tickOnce(db, { projectId: pid2, owner: 'runner-1' });
  await tickOnce(db, { projectId: pid2, owner: 'runner-1' });
  const pending = await db.all('SELECT * FROM ontogenesis_approval_requests WHERE project_id = ?', [pid2]);
  await db.run(`UPDATE ontogenesis_approval_requests SET status = 'denied' WHERE id = ?`, [pending[0].id]);
  const refused = await tickOnce(db, { projectId: pid2, owner: 'runner-1' });
  assert.strictEqual(refused.note, 'action-refusee');
  const row = await db.get('SELECT * FROM ontogenesis_backlog WHERE id = ?', [task2]);
  assert.strictEqual(row.status, 'blocked');

  // Action saine et autorisée : unanimité immédiate, aucune approbation.
  const { defaultConfig } = require('../src/services/ontogenesis/configSchema');
  const pid3 = await store.createProject(db, { rootPath: 'C:/sain', branch: 'codex/ontogenesis', objective: 'sain', config: defaultConfig() });
  await store.addTask(db, { projectId: pid3, title: 'simple', priority: 1 });
  await tickOnce(db, { projectId: pid3, owner: 'runner-1' });
  const healthy = await tickOnce(db, { projectId: pid3, owner: 'runner-1' });
  assert.strictEqual(healthy.note, 'dispatch-requiert-harnais');
  const noRitual = await db.all('SELECT * FROM ontogenesis_decisions WHERE project_id = ?', [pid3]);
  assert.strictEqual(noRitual.length, 0);

  console.log('ontogenesis ritual checks passed.');
})().catch((error) => { console.error(error); process.exit(1); });
