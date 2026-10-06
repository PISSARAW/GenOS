'use strict';

const { withTransaction } = require('../../db');
const { markInbox, postEvent } = require('./inboxService');
const { recordMemory } = require('./memoryService');
const { notify } = require('./notificationService');

async function applyPriority(db, row) {
  const input = JSON.parse(row.body);
  if (!input.taskId || !Number.isSafeInteger(input.priority)) throw new Error('priorite-invalide');
  const info = await db.run(`UPDATE ontogenesis_backlog SET priority = ?, updated_at = datetime('now')
    WHERE id = ? AND project_id = ? AND status != 'done'`, [input.priority, input.taskId, row.project_id]);
  if (!info.changes) throw new Error('tache-introuvable-ou-terminee');
  await recordMemory(db, { projectId: row.project_id, kind: 'decision', content: row.body,
    provenance: { inboxId: row.id, action: 'priority' } });
  await postEvent(db, { projectId: row.project_id, type: 'user_reply', payload: { inboxId: row.id } });
}

async function applyMessage(db, row) {
  if (row.kind === 'priority') return applyPriority(db, row);
  const kind = row.kind === 'user' ? 'preference' : 'decision';
  await recordMemory(db, { projectId: row.project_id, kind, content: row.body,
    provenance: { inboxId: row.id, source: 'operator', messageKind: row.kind } });
  if (row.kind === 'user') await postEvent(db, { projectId: row.project_id, type: 'user_reply',
    payload: { inboxId: row.id } });
}

async function consumeMessage(db, row) {
  try {
    await withTransaction(db, async () => {
      const current = await db.get("SELECT status FROM ontogenesis_inbox WHERE id = ?", [row.id]);
      if (current?.status !== 'pending') return;
      await applyMessage(db, row);
      await markInbox(db, row.id, 'applied');
    });
  } catch (error) {
    if (error.code || !['SyntaxError', 'Error'].includes(error.name)) throw error;
    await withTransaction(db, async () => {
      await markInbox(db, row.id, 'rejected');
      await notify(db, { projectId: row.project_id, kind: 'decision_needed',
        payload: { inboxId: row.id, reason: error.message } });
    });
  }
}

async function processInbox(db, projectId) {
  const pending = await db.all("SELECT * FROM ontogenesis_inbox WHERE project_id = ? AND status = 'pending' ORDER BY rowid LIMIT 100", [projectId]);
  for (const row of pending) await consumeMessage(db, row);
  return pending.length;
}

async function operatorContext(db, projectId) {
  const rows = await db.all('SELECT kind, content, provenance_json FROM ontogenesis_memory WHERE project_id = ? ORDER BY rowid DESC LIMIT 20', [projectId]);
  return rows.reverse().map((row) => ({ kind: row.kind, content: row.content.slice(0, 2000),
    provenance: JSON.parse(row.provenance_json) }));
}

module.exports = { processInbox, operatorContext };
