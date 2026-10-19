'use strict';

const { adapter } = require('./actionProvider');
const { executeRecovery } = require('./recoveryService');
const { executeDevelopment } = require('./developmentJobService');

async function developmentCandidates(db, projectId) {
  const endocrine = require('./developmentalEndocrineBridge');
  const rows = await db.all(`SELECT j.initiative_id, o.dimension FROM shev_development_jobs j
    JOIN shev_initiatives i ON i.id = j.initiative_id
    JOIN shev_observations o ON o.project_id = i.project_id AND o.id = i.observation_id
    WHERE j.project_id = ? AND j.status = 'approved'
    ORDER BY j.initiative_id LIMIT 100`, [projectId]);
  const history = await endocrine.loadProjectHistory(db, projectId);
  const pressure = endocrine.calculatePressure(history.observations, history.episodes);
  return endocrine.prioritizeJobs(rows.map((row) => ({ ...row, id: row.initiative_id })),
    pressure.profile).slice(0, 5);
}

async function tickActions(db, input) {
  const results = [];
  const recoveries = await db.all(`SELECT r.monitoring_id FROM shev_recoveries r
    JOIN shev_monitoring m ON m.id = r.monitoring_id JOIN shev_initiatives i ON i.id = m.initiative_id
    WHERE i.project_id = ? AND r.status = 'approved' LIMIT 5`, [input.projectId]);
  const development = await developmentCandidates(db, input.projectId);
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

module.exports = { tickActions, developmentCandidates };
