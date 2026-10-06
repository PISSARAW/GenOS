'use strict';

const ACTIVE = ['INITIALIZING', 'PLANNING', 'EXECUTING', 'VERIFYING', 'INTEGRATING', 'STOPPING', 'STOPPED'];

async function observeEvents(db, projectId) {
  return db.all('SELECT id FROM ontogenesis_events WHERE project_id = ? AND consumed = 0 ORDER BY rowid LIMIT 100', [projectId]);
}

async function acknowledgeObservedEvents(db, ctx, outcome) {
  const considered = ACTIVE.includes(ctx.project.state) || ACTIVE.includes(outcome.state);
  if (!considered || !ctx.observedEvents.length) return;
  const ids = ctx.observedEvents.map((event) => event.id);
  const placeholders = ids.map(() => '?').join(',');
  await db.run(`UPDATE ontogenesis_events SET consumed = 1 WHERE project_id = ? AND id IN (${placeholders})`, [ctx.project.id, ...ids]);
}

module.exports = { observeEvents, acknowledgeObservedEvents };
