'use strict';

const DELIVERY = {
  todo: 'pending', doing: 'running', verifying: 'verifying',
  integrating: 'integrating', done: 'delivered', blocked: 'blocked'
};

function missionState(row) {
  const admission = row.status === 'rejected' ? 'rejected'
    : row.status === 'queued' ? 'accepted' : 'awaiting_authority';
  const delivery = row.task_status ? DELIVERY[row.task_status] : 'not_started';
  const effect = row.project_result || 'not_assessed';
  const monitoring = row.watch_status === 'alert' ? 'regressed'
    : row.watch_status === 'active' ? 'active' : 'not_started';
  return { admission, delivery, effect, monitoring,
    successful: delivery === 'delivered' && effect === 'confirmed' && monitoring !== 'regressed' };
}

async function getMissionLifecycle(db, input) {
  if (!input?.projectId || !input.initiativeId) {
    throw new TypeError('SHEV mission lifecycle requires project and initiative identifiers.');
  }
  const row = await db.get(`SELECT i.*, b.status AS task_status,
      e.project_result, e.agent_result, w.status AS watch_status
    FROM shev_initiatives i
    LEFT JOIN ontogenesis_backlog b ON b.id = i.task_id AND b.project_id = i.project_id
    LEFT JOIN shev_effects e ON e.initiative_id = i.id
    LEFT JOIN shev_watches w ON w.initiative_id = i.id
    WHERE i.project_id = ? AND i.id = ?`, [input.projectId, input.initiativeId]);
  if (!row) throw new Error('SHEV mission is absent.');
  return { projectId: row.project_id, initiativeId: row.id,
    observationId: row.observation_id, taskId: row.task_id,
    mandateVersion: row.mandate_version, ...missionState(row) };
}

module.exports = { getMissionLifecycle, missionState };
