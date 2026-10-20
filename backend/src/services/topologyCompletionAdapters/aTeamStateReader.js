'use strict';

const sessionStore = require('../topologySessionStore');
const runStore = require('../aTeam/teamRunStore');
const graphStore = require('../aTeam/workGraph/workGraphStore');

function requestedRunId(context = {}) {
  return context.teamRunId || context.output?.teamRunId
    || context.output?.result?.teamRunId || context.sessionId || null;
}

function parseState(row) {
  try { return JSON.parse(row.state_json || '{}'); }
  catch (_) { return null; }
}

async function missionRunIds(db, missionId) {
  await sessionStore.ensureTable(db);
  const rows = await db.all(`SELECT id, state_json FROM topology_sessions
    WHERE topology = 'a_team' ORDER BY updated_at DESC, id`);
  return rows.filter((row) => parseState(row)?.missionId === missionId)
    .map((row) => row.id);
}

async function locateRun(input) {
  const explicitId = requestedRunId(input.context);
  if (explicitId) return { teamRunId: explicitId };
  const ids = await missionRunIds(input.db, input.missionId);
  if (!ids.length) return { status: 'partial', reason: 'ateam_run_missing' };
  if (ids.length > 1) return { status: 'partial', reason: 'ateam_run_ambiguous' };
  return { teamRunId: ids[0] };
}

async function loadRun(db, teamRunId) {
  try { return await runStore.load(db, teamRunId); }
  catch (_) { return { integrityFailure: true }; }
}

async function loadGraph(db, workGraphId) {
  try { return await graphStore.load(db, workGraphId); }
  catch (_) { return { integrityFailure: true }; }
}

function runIssue(run, missionId) {
  if (run?.integrityFailure) return { status: 'failed', reason: 'ateam_run_integrity_failed' };
  if (!run) return { status: 'partial', reason: 'ateam_run_missing' };
  if (run.missionId !== missionId) return { status: 'failed', reason: 'ateam_mission_scope_mismatch', run };
  if (!run.workGraphId) return { status: 'partial', reason: 'ateam_work_graph_missing', run };
  return null;
}

function graphIssue(run, graph) {
  if (graph?.integrityFailure) return { status: 'failed', reason: 'ateam_work_graph_integrity_failed', run };
  if (!graph) return { status: 'partial', reason: 'ateam_work_graph_missing', run };
  if (graph.teamRunId !== run.teamRunId) {
    return { status: 'failed', reason: 'ateam_run_graph_scope_mismatch', run, graph };
  }
  return null;
}

async function read(input = {}) {
  const { db, missionId, context = {} } = input;
  if (!db || !missionId) return { status: 'partial', reason: 'ateam_scope_missing' };
  const located = await locateRun({ db, missionId, context });
  if (!located.teamRunId) return located;
  const run = await loadRun(db, located.teamRunId);
  const invalidRun = runIssue(run, missionId);
  if (invalidRun) return invalidRun;
  const graph = await loadGraph(db, run.workGraphId);
  const invalidGraph = graphIssue(run, graph);
  if (invalidGraph) return invalidGraph;
  return { status: 'read', run, graph };
}

module.exports = { read, requestedRunId };
