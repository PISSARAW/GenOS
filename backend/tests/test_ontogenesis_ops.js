'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

async function memoryDb() {
  const sqlite3 = require('sqlite3');
  const { open } = require('sqlite');
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const { migrateOntogenesis } = require('../src/db/migrations/migrateOntogenesis');
  const { migrateOntogenesisConversation } = require('../src/db/migrations/migrateOntogenesisConversation');
  await migrateOntogenesis(db);
  await migrateOntogenesisConversation(db);
  return db;
}

(async () => {
  const control = require('../src/services/ontogenesis/controlService');
  const store = require('../src/services/ontogenesis/projectStore');

  // Modes inconnus refusés.
  assert.strictEqual(control.isMode('paused'), true);
  assert.strictEqual(control.isMode('demain'), false);

  const db = await memoryDb();
  const { defaultConfig } = require('../src/services/ontogenesis/configSchema');
  const pid = await store.createProject(db, { rootPath: 'C:/proj', branch: 'codex/ontogenesis', objective: 'ops', config: defaultConfig() });
  await store.addTask(db, { projectId: pid, title: 't1', priority: 1 });

  // Pause persistée avec raison ; reprise via événement.
  await control.pauseProject(db, { projectId: pid, reason: 'revue-humaine' });
  const paused = await control.getControl(db, pid);
  assert.strictEqual(paused.mode, 'paused');
  assert.strictEqual(paused.reason, 'revue-humaine');
  const inbox = require('../src/services/ontogenesis/inboxService');
  assert.strictEqual((await inbox.listPendingInbox(db, pid)).length, 1);

  await control.resumeProject(db, { projectId: pid });
  const resumed = await control.getControl(db, pid);
  assert.strictEqual(resumed.mode, 'running');
  assert.strictEqual((await inbox.listPendingEvents(db, pid)).length, 1);

  // Vue d'activité : tâche, budgets, mémoire, branche, attente.
  const view = await control.getStatusView(db, { projectId: pid });
  assert.strictEqual(view.projectId, pid);
  assert.strictEqual(view.state, 'INITIALIZING');
  assert.strictEqual(view.control, 'running');
  assert.strictEqual(view.branch, 'codex/ontogenesis');
  assert.strictEqual(view.backlog.total, 1);
  assert.ok(view.budgets && view.budgets.tokens > 0);
  assert.ok(view.memory.totalMb > 0);
  assert.strictEqual(view.lastCommit, null);

  // Rétention bornée : seul l'ancien consommé est purgé.
  await inbox.postEvent(db, { projectId: pid, type: 'git', payload: {} });
  const pending = await inbox.listPendingEvents(db, pid);
  for (const event of pending) await inbox.consumeEvent(db, event.id);
  await db.run(`UPDATE ontogenesis_events SET created_at = datetime('now', '-40 days') WHERE id = ?`, [pending[0].id]);
  const pruned = await control.pruneHistory(db, { projectId: pid, olderThanDays: 30 });
  assert.strictEqual(pruned.events, 1);
  const remaining = await db.get('SELECT COUNT(*) AS n FROM ontogenesis_events WHERE project_id = ?', [pid]);
  assert.strictEqual(remaining.n, pending.length - 1);

  // Projet inconnu : erreur explicite, pas de vue inventée.
  await assert.rejects(control.getStatusView(db, { projectId: 'absent' }), /projet-introuvable/);

  // Autostart opt-in dans un bac à sable (pas le vrai Startup).
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'onto-auto-'));
  process.env.GENOS_CONFIG_DIR = path.join(sandbox, 'config');
  const auto = require('../src/services/ontogenesis/autostartService');
  assert.strictEqual(auto.getAutostartConfig().enabled, false);
  const enabled = auto.enableAutostart({ projectId: pid, startupDir: sandbox });
  assert.strictEqual(enabled.config.enabled, true);
  assert.ok(fs.existsSync(enabled.batFile));
  assert.ok(fs.readFileSync(enabled.batFile, 'utf8').includes(pid));
  const disabled = auto.disableAutostart({ startupDir: sandbox });
  assert.strictEqual(disabled.config.enabled, false);
  assert.strictEqual(fs.existsSync(disabled.batFile), false);
  delete process.env.GENOS_CONFIG_DIR;
  fs.rmSync(sandbox, { recursive: true, force: true });

  console.log('ontogenesis ops checks passed.');
})().catch((error) => { console.error(error); process.exit(1); });
