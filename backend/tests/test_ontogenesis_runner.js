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
  const schedules = require('../src/services/ontogenesis/scheduleService');
  const store = require('../src/services/ontogenesis/projectStore');
  const { tickOnce } = require('../src/services/ontogenesis/tickService');

  // Intervalles et échéances : calcul pur du prochain passage.
  const base = Date.parse('2026-10-01T10:00:00.000Z');
  assert.strictEqual(
    schedules.nextRunAfter('interval', { everyMinutes: 30 }, base),
    '2026-10-01T10:30:00.000Z'
  );
  assert.throws(() => schedules.nextRunAfter('interval', { everyMinutes: 0 }, base), /intervalle-invalide/);
  assert.throws(() => schedules.nextRunAfter('once', {}, base), /echeance-invalide/);

  const db = await memoryDb();
  const pid = await store.createProject(db, { rootPath: 'C:/proj', branch: 'codex/ontogenesis', objective: 'run' });

  // Échéance due → événement au tick ; intervalle replanifié, once terminé.
  const past = new Date(Date.now() - 60000).toISOString();
  const once = await schedules.createSchedule(db, { projectId: pid, kind: 'once', spec: { at: past } });
  const every = await schedules.createSchedule(db, { projectId: pid, kind: 'interval', spec: { everyMinutes: 60 * 24 * 365 } });
  const due = await schedules.dueSchedules(db, { projectId: pid });
  assert.strictEqual(due.length, 1);
  assert.strictEqual(due[0].id, once);

  const first = await tickOnce(db, { projectId: pid, owner: 'runner-1' });
  assert.strictEqual(first.ticked, true);
  assert.strictEqual(first.fired, 1);
  assert.strictEqual(first.state, 'PLANNING');
  const onceRow = await db.get('SELECT * FROM ontogenesis_schedules WHERE id = ?', [once]);
  assert.strictEqual(onceRow.status, 'done');
  const everyRow = await db.get('SELECT * FROM ontogenesis_schedules WHERE id = ?', [every]);
  assert.strictEqual(everyRow.status, 'active');

  // Exclusion mutuelle : un second runner ne tique pas pendant le claim.
  const claims = require('../src/services/ontogenesis/claimService');
  await claims.acquireClaim(db, { projectId: pid, owner: 'holder', ttlMs: 60000 });
  const contended = await tickOnce(db, { projectId: pid, owner: 'runner-2' });
  assert.deepStrictEqual(contended, { ticked: false, reason: 'claim-actif' });
  await claims.releaseClaim(db, { projectId: pid, owner: 'holder' });

  // Pause opérateur respectée par le tick ; arrêt fin d'une tâche doing.
  const control = require('../src/services/ontogenesis/controlService');
  await control.pauseProject(db, { projectId: pid, reason: 'revue' });
  const paused = await tickOnce(db, { projectId: pid, owner: 'runner-1' });
  assert.strictEqual(paused.decision.event, 'paused');
  await control.resumeProject(db, { projectId: pid });
  const task = await store.addTask(db, { projectId: pid, title: 'courante', priority: 1 });
  await store.setTaskStatus(db, { taskId: task, status: 'doing' });
  const stopped = await schedules.stopTask(db, { taskId: task, reason: 'changement-cap' });
  assert.deepStrictEqual(stopped, { taskId: task, stopped: true, status: 'blocked', reason: 'changement-cap' });
  const idle = await schedules.stopTask(db, { taskId: task, reason: 'bis' });
  assert.strictEqual(idle.stopped, false);

  // La reprise consomme l'intention opérateur : PAUSED → PLANNING.
  const woken = await tickOnce(db, { projectId: pid, owner: 'runner-1' });
  assert.strictEqual(woken.decision.event, 'resumed');
  assert.strictEqual(woken.state, 'PLANNING');

  // Dispatch sans harnais : aucun effet de bord, état inchangé.
  const ready = await store.addTask(db, { projectId: pid, title: 'prete', priority: 1 });
  await store.setTaskStatus(db, { taskId: ready, status: 'todo' });
  const planned = await tickOnce(db, { projectId: pid, owner: 'runner-1' });
  assert.strictEqual(planned.note, 'dispatch-requiert-harnais');
  const project = await store.getProject(db, pid);
  assert.strictEqual(project.state, 'PLANNING');

  console.log('ontogenesis runner checks passed.');
})().catch((error) => { console.error(error); process.exit(1); });
