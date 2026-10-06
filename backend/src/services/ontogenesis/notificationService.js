'use strict';

const crypto = require('crypto');

/**
 * Notifications sobres et demandes d'approbation (ADR 0235 §7-8).
 * Notifier sur résultat, blocage ou décision ; silence sinon.
 */

const NOTIFICATION_KINDS = ['result', 'blocked', 'decision_needed'];

async function notify(db, note) {
  if (!NOTIFICATION_KINDS.includes(note.kind)) throw new Error('notification-kind-invalide');
  const payload = JSON.stringify(note.payload || {});
  const existing = await db.get("SELECT id FROM ontogenesis_notifications WHERE project_id = ? AND kind = ? AND payload_json = ? AND status = 'pending' LIMIT 1", [note.projectId, note.kind, payload]);
  if (existing) return existing.id;
  const id = note.id || `notif_${crypto.randomUUID()}`;
  await db.run(
    `INSERT INTO ontogenesis_notifications (id, project_id, kind, payload_json)
     VALUES (?, ?, ?, ?)`,
    [id, note.projectId, note.kind, JSON.stringify(note.payload || {})]
  );
  return id;
}

async function listPendingNotifications(db, projectId) {
  return db.all(
    `SELECT * FROM ontogenesis_notifications WHERE project_id = ? AND status = 'pending'
     ORDER BY created_at ASC`,
    [projectId]
  );
}

const NOTIFICATION_STATUSES = ['pending', 'sent', 'acked'];

async function markNotified(db, id, status) {
  if (!NOTIFICATION_STATUSES.includes(status)) throw new Error('notification-statut-inconnu');
  await db.run('UPDATE ontogenesis_notifications SET status = ? WHERE id = ?', [status, id]);
}

async function requestApproval(db, request) {
  const id = request.id || `appr_${crypto.randomUUID()}`;
  await db.run(
    `INSERT INTO ontogenesis_approval_requests (id, project_id, action, scope_json)
     VALUES (?, ?, ?, ?)`,
    [id, request.projectId, request.action, JSON.stringify(request.scope || {})]
  );
  return id;
}

module.exports = { NOTIFICATION_KINDS, NOTIFICATION_STATUSES, notify, listPendingNotifications, markNotified, requestApproval };
