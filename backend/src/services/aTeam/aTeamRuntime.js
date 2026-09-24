'use strict';

const { createHash } = require('crypto');
const teamRunStore = require('./teamRunStore');
const graphCompiler = require('./workGraph/workGraphCompiler');
const graphStore = require('./workGraph/workGraphStore');

const STATUS_TRANSITIONS = Object.freeze({
  FORMING: ['READY', 'FAILED', 'CANCELLED'],
  READY: ['RUNNING', 'BLOCKED', 'FAILED', 'CANCELLED'],
  RUNNING: ['REPAIRING', 'COMPLETED', 'BLOCKED', 'FAILED', 'CANCELLED'],
  REPAIRING: ['RUNNING', 'BLOCKED', 'FAILED', 'CANCELLED'],
  BLOCKED: ['READY', 'RUNNING', 'REPAIRING', 'FAILED', 'CANCELLED'],
  FAILED: [], COMPLETED: [], CANCELLED: []
});

const PHASE_TRANSITIONS = Object.freeze({
  ELIGIBILITY: ['FORMATION'],
  FORMATION: ['PREBRIEF'],
  PREBRIEF: ['EXECUTION'],
  EXECUTION: ['INTEGRATION', 'REPAIR', 'DEBRIEF'],
  INTEGRATION: ['REPAIR', 'DEBRIEF'],
  REPAIR: ['EXECUTION', 'INTEGRATION'],
  DEBRIEF: []
});

function stableId(prefix, key) {
  const digest = createHash('sha256').update(String(key)).digest('hex').slice(0, 32);
  return `${prefix}_${digest}`;
}

function graphIdFor(teamRunId) {
  return stableId('workgraph', teamRunId);
}

function sameMission(existing, draft) {
  return existing.missionId === draft.missionId && existing.goal === String(draft.goal || '').trim();
}

async function loadExisting(db, draft) {
  const existing = await teamRunStore.load(db, draft.teamRunId);
  if (!existing) return null;
  if (!sameMission(existing, draft)) {
    throw Object.assign(new Error('A-Team idempotency key was reused for a different mission.'), { code: 'ATEAM_RUN_IDEMPOTENCY_CONFLICT' });
  }
  const graph = await graphStore.load(db, existing.workGraphId);
  if (!graph || graph.teamRunId !== existing.teamRunId) {
    throw Object.assign(new Error('Canonical A-Team run has no matching WorkGraph.'), { code: 'ATEAM_RUN_GRAPH_MISSING' });
  }
  return { run: existing, graph, created: false };
}

function buildRunDraft(input) {
  const missionId = String(input.missionId || '').trim();
  const key = input.idempotencyKey || input.teamRunId || missionId;
  if (!missionId || !key) throw Object.assign(new Error('A-Team run requires missionId and an idempotency key.'), { code: 'ATEAM_RUN_IDENTITY_REQUIRED' });
  const teamRunId = input.teamRunId || stableId('ateam', `${missionId}:${key}`);
  const graphId = input.workGraphId || graphIdFor(teamRunId);
  return teamRunStore.teamRunRecord({ ...input, missionId, teamRunId, workGraphId: graphId });
}

async function createRun(input = {}) {
  const draft = buildRunDraft(input);
  const existing = await loadExisting(input.db, draft);
  if (existing) return existing;
  return persistNewRun(input, draft);
}

async function persistNewRun(input, draft) {
  const graphId = draft.workGraphId;
  const teamRunId = draft.teamRunId;
  const graphDraft = graphCompiler.compileWorkGraph({ workGraphId: graphId, teamRunId, members: input.members || [] });
  const graphResult = await persistGraph(input.db, graphDraft);
  draft.workGraphId = graphResult.graph.workGraphId;
  assignStages(draft.members, graphResult.graph);
  try {
    const run = await teamRunStore.create(input.db, draft);
    return { run, graph: graphResult.graph, created: true };
  } catch (error) {
    const raced = await loadExisting(input.db, draft);
    if (raced) return raced;
    if (graphResult.created) await require('./topologySessionStore').remove(input.db, graphId);
    throw error;
  }
}

async function persistGraph(db, graphDraft) {
  try {
    return { graph: await graphStore.create(db, graphDraft), created: true };
  } catch (error) {
    if (error.code !== 'TOPOLOGY_SESSION_CONFLICT') throw error;
    const graph = await graphStore.load(db, graphDraft.workGraphId);
    if (!graph || graph.teamRunId !== graphDraft.teamRunId) throw error;
    return { graph, created: false };
  }
}

function assignStages(members, graph) {
  for (const member of members) {
    const key = member.memberId || member.agentId || member.workerId || member.domain || member.subSystem || member.label || member.role;
    member.pipelineStage = graph.memberStages[key] || 0;
  }
}

function validateTransition(current, patch) {
  const nextStatus = patch.status || current.status;
  const nextPhase = patch.phase || current.phase;
  if (nextStatus !== current.status && !STATUS_TRANSITIONS[current.status]?.includes(nextStatus)) {
    throw Object.assign(new Error(`Invalid A-Team status transition ${current.status} → ${nextStatus}.`), { code: 'ATEAM_RUN_TRANSITION_INVALID' });
  }
  if (nextPhase !== current.phase && !PHASE_TRANSITIONS[current.phase]?.includes(nextPhase)) {
    throw Object.assign(new Error(`Invalid A-Team phase transition ${current.phase} → ${nextPhase}.`), { code: 'ATEAM_RUN_PHASE_INVALID' });
  }
}

async function transitionRun(input = {}) {
  const current = await teamRunStore.load(input.db, input.teamRunId);
  if (!current) throw Object.assign(new Error(`Unknown A-Team run '${input.teamRunId}'.`), { code: 'ATEAM_RUN_UNKNOWN' });
  if (input.revision !== current.revision) throw Object.assign(new Error('A-Team runtime transition requires the current revision.'), { code: 'ATEAM_RUN_CONFLICT' });
  const patch = input.patch || {};
  validateTransition(current, patch);
  return teamRunStore.update({ db: input.db, teamRunId: input.teamRunId, revision: input.revision, patch });
}

module.exports = { STATUS_TRANSITIONS, PHASE_TRANSITIONS, stableId, createRun, transitionRun };
