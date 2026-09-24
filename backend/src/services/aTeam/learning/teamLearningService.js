'use strict';

const runtime = require('../aTeamRuntime');
const teamRunStore = require('../teamRunStore');
const { buildTeamDebrief } = require('./teamDebriefService');
const { summarizePerformance } = require('./teamPerformanceMemory');
const { deriveStaffingSignals } = require('./staffingLearningService');
const store = require('./teamLearningStore');

async function persistTeamDebrief(input = {}) {
  const run = await requireTerminalRun(input.db, input.teamRunId);
  const debriefId = runtime.stableId('ateam_debrief', run.teamRunId);
  const existing = await store.load(input.db, debriefId);
  if (existing) {
    await linkRun(input.db, run, debriefId);
    return existing;
  }
  const debrief = await buildVerifiedDebrief(input, run, debriefId);
  const saved = await store.save(input.db, debrief);
  await linkRun(input.db, run, debriefId);
  return saved.debrief;
}

async function requireTerminalRun(db, teamRunId) {
  const run = await teamRunStore.load(db, teamRunId);
  if (!run) throw coded(`Unknown A-Team run '${teamRunId}'.`, 'ATEAM_RUN_UNKNOWN');
  if (!['COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED'].includes(run.status)) {
    throw coded('A-Team debrief requires a terminal run.', 'ATEAM_DEBRIEF_RUN_NOT_TERMINAL');
  }
  return run;
}

async function buildVerifiedDebrief(input, run, debriefId) {
  const base = buildTeamDebrief({ ...input, teamRun: run });
  const evidenceIds = new Set(base.evidenceIds);
  const lessons = await Promise.all(base.lessons.map((lesson) => verifyLesson({ input, lesson, evidenceIds, teamRunId: run.teamRunId })));
  const taskProfile = String(input.taskProfile || run.organization || 'default').trim().toLowerCase();
  return {
    ...base, debriefId, taskProfile, lessons,
    memberIds: run.members.map((member) => member.agentId || member.workerId || member.memberId),
    memberOutcomes: verifiedOutcomes(input.memberOutcomes, evidenceIds),
    createdAt: input.createdAt || new Date().toISOString()
  };
}

async function verifyLesson({ input, lesson, evidenceIds, teamRunId }) {
  if (!lesson.reusable) return lesson;
  if (!lesson.evidenceId || !evidenceIds.has(lesson.evidenceId) || typeof input.evidenceIsUsable !== 'function') {
    return { ...lesson, reusable: false };
  }
  const verified = await input.evidenceIsUsable({ db: input.db, teamRunId, evidenceId: lesson.evidenceId });
  return { ...lesson, reusable: verified === true };
}

function verifiedOutcomes(outcomes, evidenceIds) {
  if (!outcomes || typeof outcomes !== 'object') return {};
  return Object.fromEntries(Object.entries(outcomes).filter(([, value]) => evidenceIds.has(value?.evidenceId) && Number.isFinite(Number(value?.successRate)))
    .map(([memberId, value]) => [memberId, { successRate: Math.max(0, Math.min(1, Number(value.successRate))), evidenceId: value.evidenceId }]));
}

async function linkRun(db, run, debriefId) {
  const current = await teamRunStore.load(db, run.teamRunId);
  if (current.execution?.debriefId === debriefId) return current;
  return runtime.transitionRun({
    db, teamRunId: run.teamRunId, revision: current.revision,
    patch: { execution: { ...current.execution, debriefId, learningStatus: 'RECORDED' } }
  });
}

async function learningProfile(input = {}) {
  const debriefs = await store.list(input.db, normalizeProfile(input.taskProfile));
  return {
    performance: summarizePerformance(debriefs),
    staffingSignals: deriveStaffingSignals(debriefs),
    candidatePriors: candidatePriors(debriefs)
  };
}

function normalizeProfile(value) {
  return String(value || '').trim().toLowerCase();
}

function candidatePriors(debriefs) {
  const outcomes = new Map();
  for (const debrief of debriefs) {
    for (const [memberId, result] of Object.entries(debrief.memberOutcomes || {})) {
      if (!outcomes.has(memberId)) outcomes.set(memberId, []);
      outcomes.get(memberId).push(result.successRate);
    }
  }
  return Object.fromEntries([...outcomes].map(([memberId, values]) => [memberId, {
    sampleCount: values.length,
    successRate: values.reduce((sum, score) => sum + score, 0) / values.length
  }]));
}

function coded(message, code) {
  return Object.assign(new Error(message), { code });
}

module.exports = { persistTeamDebrief, learningProfile, candidatePriors };
