'use strict';

const TERMINAL = new Set([
  'completed', 'failed', 'error', 'blocked', 'unverified', 'terminated', 'quarantined',
  'missing_run'
]);

async function waitForMetapopulationWorkers(db, members, request) {
  const options = typeof request === 'object' && request !== null ? request : { timeoutMs: request };
  const requested = Number(options.timeoutMs);
  const limit = Number.isFinite(requested) ? Math.max(10000, Math.min(requested, 600000)) : 180000;
  const deadline = Date.now() + limit;
  while (Date.now() < deadline) {
    const statuses = options.requireRuns
      ? await runStatuses(db, members, options.missionId) : await agentStatuses(db, members);
    if (statuses.every((status) => TERMINAL.has(status))) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function runStatuses(db, members, missionId) {
  const reader = require('./workerResultReader.cjs');
  return Promise.all(members.map(async (member) => {
    if (!member.executionRunId) return 'missing_run';
    const result = await reader.read(db, { missionId, executionRunId: member.executionRunId, member });
    return result.status;
  }));
}

async function agentStatuses(db, members) {
  const rows = await Promise.all(members.map((member) => db.get(
    'SELECT status FROM agents WHERE id = ?', member.workerId)));
  return rows.map((row) => row?.status || 'missing');
}

module.exports = { waitForMetapopulationWorkers };
