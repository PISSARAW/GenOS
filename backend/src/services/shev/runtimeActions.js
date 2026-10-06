'use strict';

const { adapter } = require('./actionProvider');
const { executeRecovery } = require('./recoveryService');
const { executeDevelopment } = require('./developmentJobService');

async function tickActions(db, input) {
  const results = [];
  const recoveries = await db.all(`SELECT r.monitoring_id FROM shev_recoveries r
    JOIN shev_monitoring m ON m.id = r.monitoring_id JOIN shev_initiatives i ON i.id = m.initiative_id
    WHERE i.project_id = ? AND r.status = 'approved' LIMIT 5`, [input.projectId]);
  const development = await db.all(`SELECT initiative_id FROM shev_development_jobs
    WHERE project_id = ? AND status = 'approved' LIMIT 5`, [input.projectId]);
  for (const row of recoveries) {
    await input.fence();
    results.push(await runAction(() => executeRecovery(db, { projectId: input.projectId,
      monitoringId: row.monitoring_id, perform: adapter('performRecovery') })));
  }
  for (const row of development) {
    await input.fence();
    results.push(await runAction(() => executeDevelopment(db, { projectId: input.projectId, initiativeId: row.initiative_id })));
  }
  return results;
}

async function runAction(action) {
  try { return await action(); } catch (error) { return { status: 'blocked', error: error.message }; }
}

module.exports = { tickActions };
