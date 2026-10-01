'use strict';

const crypto = require('crypto');

/**
 * Boîte de réception et événements persistants (ADR 0235 §7).
 * Les messages actualisent les priorités sans relancer le projet.
 */

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

async function postInbox(db, message) {
  const id = message.id || newId('inbox');
  await db.run(
    `INSERT INTO ontogenesis_inbox (id, project_id, kind, body, status)
     VALUES (?, ?, ?, ?, 'pending')`,
    [id, message.projectId, message.kind || 'user', message.body || '']
  );
  return id;
}

async function listPendingInbox(db, projectId) {
  return db.all(
    `SELECT * FROM ontogenesis_inbox WHERE project_id = ? AND status = 'pending'
     ORDER BY created_at ASC`,
    [projectId]
  );
}

async function markInbox(db, id, status) {
  await db.run('UPDATE ontogenesis_inbox SET status = ? WHERE id = ?', [status, id]);
}

async function postEvent(db, event) {
  const id = event.id || newId('evt');
  await db.run(
    `INSERT INTO ontogenesis_events (id, project_id, type, payload_json)
     VALUES (?, ?, ?, ?)`,
    [id, event.projectId, event.type, JSON.stringify(event.payload || {})]
  );
  return id;
}

async function listPendingEvents(db, projectId) {
  return db.all(
    `SELECT * FROM ontogenesis_events WHERE project_id = ? AND consumed = 0
     ORDER BY created_at ASC`,
    [projectId]
  );
}

async function consumeEvent(db, id) {
  await db.run('UPDATE ontogenesis_events SET consumed = 1 WHERE id = ?', [id]);
}

module.exports = { postInbox, listPendingInbox, markInbox, postEvent, listPendingEvents, consumeEvent };
