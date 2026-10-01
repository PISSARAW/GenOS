'use strict';

/**
 * Tour résident du contrôleur (roadmap §P1).
 * Un tick = claim → échéances → observation → décision → effets → état.
 * Pur côté décision (stepLoop) ; le dispatch réel exige un harnais
 * d'exécution, le tick s'arrête alors sans effet de bord.
 */

const { acquireClaim, releaseClaim } = require('./claimService');
const { getControl } = require('./controlService');
const { getProject, setProjectState, listTasks, addTask, bumpAttempt } = require('./projectStore');
const { selectNextTask } = require('./taskSelector');
const { stepLoop } = require('./loopController');
const { nextState } = require('./stateMachine');
const { sampleMemory, classifyLevel } = require('./memoryPressure');
const { notify } = require('./notificationService');
const { recordMemory } = require('./memoryService');
const { postEvent, listPendingEvents, consumeEvent } = require('./inboxService');
const { dueSchedules, markScheduleRan } = require('./scheduleService');

const NO_WAKE = ['STOPPING', 'STOPPED', 'EXECUTING', 'VERIFYING', 'INTEGRATING', 'INITIALIZING', 'PLANNING'];

function eventForSchedule(kind) {
  return kind === 'deadline' ? 'deadline' : 'wake';
}

function reserveOf(project) {
  try {
    const config = JSON.parse(project.config_json || '{}');
    return (config.memory && config.memory.reserveMb) || 0;
  } catch (_) {
    return 0;
  }
}

function doingOf(tasks) {
  return (tasks || []).find((task) => task.status === 'doing') || null;
}

async function fireDue(db, projectId, nowMs) {
  const due = await dueSchedules(db, { projectId });
  for (const row of due) {
    await postEvent(db, { projectId, type: eventForSchedule(row.kind), payload: { scheduleId: row.id } });
    await markScheduleRan(db, { id: row.id, nowMs });
  }
  return due.length;
}

async function loadContext(db, projectId) {
  const project = await getProject(db, projectId);
  if (!project) throw new Error('projet-introuvable');
  const control = await getControl(db, projectId);
  const tasks = await listTasks(db, projectId);
  const memoryLevel = classifyLevel(sampleMemory({ reservationsMb: 0 }), { reserveMb: reserveOf(project) });
  return { project, control, tasks, selection: selectNextTask(tasks), memoryLevel };
}

function snapshotOf(ctx) {
  return {
    state: ctx.project.state, controlMode: (ctx.control && ctx.control.mode) || 'running',
    memoryLevel: ctx.memoryLevel, budgetsOk: true, selection: ctx.selection
  };
}

async function applyNotify(db, projectId, effect) {
  const [kind, reason] = effect.slice('notify-'.length).split(':');
  await notify(db, { projectId, kind, payload: { reason: reason || '' } });
}

async function applyEffect(db, ctx, effect) {
  if (effect.startsWith('notify-')) return applyNotify(db, ctx.project.id, effect);
  const current = doingOf(ctx.tasks);
  if (effect === 'bump-attempt' && current) await bumpAttempt(db, current.id);
  if (effect === 'record-failure') {
    await recordMemory(db, { projectId: ctx.project.id, kind: 'failure', content: `echec-verification:${ctx.project.state}`, provenance: { state: ctx.project.state } });
  }
  if (effect === 'create-resolution-task') {
    await addTask(db, { projectId: ctx.project.id, title: 'resoudre-conflit-integration', priority: 100 });
  }
}

async function applyDecision(db, ctx, decision) {
  if (decision.hold || !decision.event) return { state: ctx.project.state, note: decision.reason || 'maintien' };
  if (decision.event === 'dispatch') return { state: ctx.project.state, note: 'dispatch-requiert-harnais' };
  const next = nextState(ctx.project.state, decision.event);
  if (!next) {
    await notify(db, { projectId: ctx.project.id, kind: 'blocked', payload: { reason: 'transition-impossible' } });
    return { state: ctx.project.state, note: 'transition-impossible' };
  }
  await setProjectState(db, { projectId: ctx.project.id, state: next });
  for (const effect of decision.effects || []) await applyEffect(db, ctx, effect);
  return { state: next, event: decision.event };
}

async function consumeFirstOfType(db, projectId, type) {
  const events = await listPendingEvents(db, projectId);
  const found = events.find((event) => !type || event.type === type) || null;
  if (found) await consumeEvent(db, found.id);
  return found;
}

async function sleepingWake(ctx) {
  const level = classifyLevel(sampleMemory({ reservationsMb: 0 }), { reserveMb: reserveOf(ctx.project) });
  return level === 'normal' ? 'recovered' : null;
}

async function reconcileWake(db, ctx) {
  const state = ctx.project.state;
  if (state === 'PAUSED') {
    if (ctx.control && ctx.control.mode === 'running') return 'resumed';
    return null;
  }
  if (NO_WAKE.includes(state)) return null;
  if (state === 'WAITING_INPUT') {
    const reply = await consumeFirstOfType(db, ctx.project.id, 'user_reply');
    return reply ? 'resumed' : null;
  }
  if (state === 'IDLE') {
    const any = await consumeFirstOfType(db, ctx.project.id, null);
    return any ? 'awakened' : null;
  }
  if (state === 'SLEEPING_RESOURCE') return sleepingWake(ctx);
  return null;
}

async function tickOnce(db, input) {
  const claim = await acquireClaim(db, { projectId: input.projectId, owner: input.owner, ttlMs: 30000 });
  if (!claim.acquired) return { ticked: false, reason: 'claim-actif' };
  try {
    const fired = await fireDue(db, input.projectId, input.nowMs);
    const ctx = await loadContext(db, input.projectId);
    const wake = await reconcileWake(db, ctx);
    const decision = wake ? { event: wake, effects: [] } : stepLoop(snapshotOf(ctx));
    const outcome = await applyDecision(db, ctx, decision);
    return { ticked: true, fired, decision, ...outcome };
  } finally {
    await releaseClaim(db, { projectId: input.projectId, owner: input.owner });
  }
}

module.exports = { tickOnce };
