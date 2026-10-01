'use strict';

/**
 * Vue d'activité du projet (ADR 0235 §7).
 * Pure : tâches, workers, preuves, changements, commits.
 */

function summarizeBacklog(backlog) {
  const rows = backlog || [];
  return {
    total: rows.length,
    todo: rows.filter((row) => row.status === 'todo').length,
    doing: rows.filter((row) => row.status === 'doing').length,
    blocked: rows.filter((row) => row.status === 'blocked').length,
    done: rows.filter((row) => row.status === 'done').length
  };
}

function summarizeRuns(runs) {
  const rows = runs || [];
  return {
    total: rows.length,
    running: rows.filter((row) => row.status === 'running').length,
    verified: rows.filter((row) => row.status === 'verified').length,
    unverified: rows.filter((row) => row.status === 'unverified').length,
    failed: rows.filter((row) => row.status === 'failed').length
  };
}

function buildActivity(input) {
  return {
    projectId: input.projectId,
    state: input.state,
    branch: input.branch,
    lastCommit: input.lastCommit || null,
    waitReason: input.waitReason || null,
    backlog: summarizeBacklog(input.backlog),
    runs: summarizeRuns(input.runs),
    pendingInbox: (input.inbox || []).length,
    pendingNotifications: (input.notifications || []).length,
    memory: { failures: (input.failures || []).length }
  };
}

module.exports = { buildActivity };
