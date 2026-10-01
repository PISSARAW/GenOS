'use strict';

const crypto = require('crypto');

/**
 * Échéances et intervalles de l'Ontogenèse (roadmap §P1).
 * Persistés en UTC ; le runner les convertit en événements.
 * Arrêt fin : pause de schedule, blocage de tâche en cours.
 */

const KINDS = ['interval', 'once', 'deadline'];

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function nextRunAfter(kind, spec, fromMs) {
  if (kind === 'interval') {
    const every = Number((spec && spec.everyMinutes) || 0);
    if (!(every > 0)) throw new Error('intervalle-invalide');
    return new Date(fromMs + every * 60000).toISOString();
  }
  const at = Date.parse((spec && spec.at) || '');
  if (Number.isNaN(at)) throw new Error('echeance-invalide');
  return new Date(at).toISOString();
}

async function createSchedule(db, input) {
  if (!KINDS.includes(input.kind)) throw new Error('schedule-kind-inconnu');
  const nowMs = input.nowMs || Date.now();
  const id = input.id || newId('sched');
  const next = nextRunAfter(input.kind, input.spec, nowMs);
  await db.run(
    `INSERT INTO ontogenesis_schedules
       (id, project_id, kind, spec_json, timezone, next_run_at, status, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
    [id, input.projectId, input.kind, JSON.stringify(input.spec || {}),
      input.timezone || 'UTC', next, JSON.stringify(input.payload || {})]
  );
  return id;
}

async function dueSchedules(db, input) {
  const now = input.nowIso || new Date().toISOString();
  if (input.projectId) {
    return db.all(
      `SELECT * FROM ontogenesis_schedules
       WHERE project_id = ? AND status = 'active' AND next_run_at <= ?
       ORDER BY next_run_at ASC`,
      [input.projectId, now]
    );
  }
  return db.all(
    `SELECT * FROM ontogenesis_schedules
     WHERE status = 'active' AND next_run_at <= ?
     ORDER BY next_run_at ASC`,
    [now]
  );
}

function parseSpec(row) {
  try {
    return JSON.parse(row.spec_json || '{}');
  } catch (_) {
    return {};
  }
}

async function markScheduleRan(db, input) {
  const row = await db.get('SELECT * FROM ontogenesis_schedules WHERE id = ?', [input.id]);
  if (!row) throw new Error('schedule-introuvable');
  if (row.kind === 'interval') {
    const next = nextRunAfter(row.kind, parseSpec(row), input.nowMs || Date.now());
    await db.run(`UPDATE ontogenesis_schedules SET next_run_at = ?, last_run_at = datetime('now') WHERE id = ?`, [next, row.id]);
    return { id: row.id, status: 'active', nextRunAt: next };
  }
  await db.run(`UPDATE ontogenesis_schedules SET status = 'done', last_run_at = datetime('now') WHERE id = ?`, [row.id]);
  return { id: row.id, status: 'done' };
}

async function pauseSchedule(db, scheduleId) {
  await db.run(`UPDATE ontogenesis_schedules SET status = 'paused' WHERE id = ?`, [scheduleId]);
}

async function stopTask(db, input) {
  const row = await db.get('SELECT * FROM ontogenesis_backlog WHERE id = ?', [input.taskId]);
  if (!row) throw new Error('tache-introuvable');
  if (row.status !== 'doing') return { taskId: row.id, stopped: false, status: row.status };
  await db.run(`UPDATE ontogenesis_backlog SET status = 'blocked', updated_at = datetime('now') WHERE id = ?`, [row.id]);
  return { taskId: row.id, stopped: true, status: 'blocked', reason: input.reason || '' };
}

module.exports = { KINDS, nextRunAfter, createSchedule, dueSchedules, markScheduleRan, pauseSchedule, stopTask };
