'use strict';

const values = require('../trinityProvenanceValues');

async function referenceTime(db, request) {
  if (request.completedEvidence !== true) return Date.now();
  const row = await db.get(`SELECT status,completed_at FROM strategy_execution_runs
    WHERE id=? AND agent_id=?`, request.runId, request.agentId);
  const time = Date.parse(row?.completed_at);
  if (row?.status !== 'completed' || !Number.isFinite(time)) {
    throw values.failure('ORACLE_COMPLETED_OBSERVATION_REQUIRED');
  }
  return time;
}

module.exports = { referenceTime };
