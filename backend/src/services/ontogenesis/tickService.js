'use strict';

/**
 * Tour résident du contrôleur (roadmap §P1).
 * Un tick = claim → échéances → observation → décision → effets → état.
 * Le CLI injecte le harnais runtime ; les tests de contrat peuvent
 * omettre ce harnais pour évaluer uniquement la décision.
 */

const { acquireClaim, releaseClaim, extendClaim } = require('./claimService');
const { getControl } = require('./controlService');
const { getProject, setProjectState, listTasks, addTask, taskByTitle, bumpAttempt } = require('./projectStore');
const { compileMission, linkCompiledTasks } = require('./missionContextService');
const { buildMissionCapabilityPlan } = require('./missionCapabilityPlanService');
const { selectNextTask } = require('./taskSelector');
const { stepLoop } = require('./loopController');
const { nextState } = require('./stateMachine');
const { sampleMemory, classifyLevel } = require('./memoryPressure');
const { notify } = require('./notificationService');
const { recordMemory } = require('./memoryService');
const { postEvent, listPendingEvents, consumeEvent } = require('./inboxService');
const { expireDue } = require('./questionService');
const { reviewAction } = require('./reviewPolicy');
const { ensureDispatchRitual } = require('./ritualService');
const { dueSchedules, markScheduleRan } = require('./scheduleService');
const { ensureTables } = require('./executionStore');
const { budgetState, memoryState } = require('./resourceGuard');
const { dispatchTask } = require('./dispatchService');
const { haltForControl, observeExecution } = require('./executionLifecycle');
const { processIntegration } = require('./integrationController');
const { compileDevelopmentalContext } = require('./developmentalContextService');

const { processInbox, operatorContext } = require('./inboxProcessor');
const { reconcileExecution, cancelBlockedTask } = require('./recoveryController');

const { prepareMission, preparationMatches } = require('./missionPreparationService');
const { observeEvents, acknowledgeObservedEvents } = require('./eventObservationService');

const NO_WAKE = ['STOPPING', 'STOPPED', 'EXECUTING', 'VERIFYING', 'INTEGRATING', 'INITIALIZING', 'PLANNING'];

function eventForSchedule(kind) {
  return kind === 'deadline' ? 'deadline' : 'wake';
}

function schedulePayload(row) {
  const payload = { scheduleId: row.id };
  let spec = {};
  try { spec = JSON.parse(row.spec_json || '{}'); } catch (_) { return payload; }
  if (row.kind === 'interval' && spec.policy === 'chronotaxis') payload.windowIndex = spec.index;
  return payload;
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
    await postEvent(db, { projectId, type: eventForSchedule(row.kind), payload: schedulePayload(row) });
    await markScheduleRan(db, { id: row.id, nowMs });
  }
  return due.length;
}

async function loadContext(db, input) {
  const project = await getProject(db, input.projectId);
  if (!project) throw new Error('projet-introuvable');
  const control = await getControl(db, input.projectId);
  const tasks = await listTasks(db, input.projectId);
  const memoryLevel = classifyLevel(sampleMemory({ reservationsMb: 0 }), { reserveMb: reserveOf(project) });
  const ctx = { project, control, tasks, config: configOf(project), selection: selectNextTask(tasks), memoryLevel, budgetsOk: true, harness: input.harness };
  if (input.harness) Object.assign(ctx, await budgetState(db, ctx), await memoryState(db, ctx, input.harness));
  return ctx;
}

async function compileEmptyBacklog(db, project, input) {
  if (input.tasks.length > 0 || !input.compiled) return null;
  const responsibility = await require('../shev/responsibilityService').getResponsibility(db, project.id);
  if (responsibility?.status === 'active') return null;
  const compiled = input.compiled;
  const created = [];
  for (const task of linkCompiledTasks(compiled.tasks)) {
    const title = task.title;
    const existing = await taskByTitle(db, project.id, title);
    if (existing) {
      created.push({ ...task, id: existing.id });
      continue;
    }
    const id = await addTask(db, { projectId: project.id, title, priority: task.priority,
      acceptance: [...task.acceptance, `context:${compiled.context}`] });
    created.push({ ...task, id });
  }
  const first = created[0];
  for (let index = 0; index < created.length; index += 1) {
    const task = created[index];
    const source = compiled.tasks[index];
    const dependency = source.dependsOnIndex === undefined ? [] : [created[source.dependsOnIndex].id];
    if (dependency.length) await db.run('UPDATE ontogenesis_backlog SET depends_on_json = ? WHERE id = ?', [JSON.stringify(dependency), task.id]);
  }
  return { kind: compiled.kind, profile: compiled.profile, capabilities: compiled.capabilities, taskId: first && first.id };
}

function snapshotOf(ctx) {
  return {
    state: ctx.project.state, controlMode: (ctx.control && ctx.control.mode) || 'running',
    memoryLevel: ctx.memoryLevel, budgetsOk: ctx.budgetsOk, selection: ctx.selection,
    workerResult: ctx.workerResult, proofsOk: ctx.proofsOk, integration: ctx.integration
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
    const failed = doingOf(ctx.tasks);
    const label = failed ? `${failed.id}:${failed.title || ''}` : 'sans-tache';
    await recordMemory(db, { projectId: ctx.project.id, kind: 'failure', content: `echec-verification:${label}:${ctx.project.state}`, provenance: { state: ctx.project.state, taskId: failed && failed.id } });
  }
  if (effect === 'create-resolution-task') {
    await addTask(db, { projectId: ctx.project.id, title: 'resoudre-conflit-integration', priority: 100 });
  }
}

function configOf(project) {
  try {
    return JSON.parse(project.config_json || '{}');
  } catch (_) {
    return {};
  }
}

async function dispatchReviewed(db, ctx) {
  const task = (ctx.selection && ctx.selection.task) || null;
  if (!task) return { state: ctx.project.state, note: 'selection-vide' };
  const action = { scope: 'edit', branch: ctx.project.branch };
  const review = reviewAction(configOf(ctx.project), action);
  if (review.verdict === 'proceed') return dispatchWithHarness(db, ctx);
  const settled = await ensureDispatchRitual(db, {
    projectId: ctx.project.id, taskId: task.id, action, review, budgetsOk: ctx.budgetsOk
  });
  if (settled.note === 'dispatch-requiert-harnais') return dispatchWithHarness(db, ctx);
  return { state: ctx.project.state, ...settled };
}

async function dispatchWithHarness(db, ctx) {
  if (!ctx.harness) return { state: ctx.project.state, note: 'dispatch-requiert-harnais' };
  return dispatchTask(db, ctx, ctx.harness);
}

async function blockInvalidMission(db, ctx) {
  const error = ctx.mission?.morphology?.error;
  if (!error || ctx.control?.mode !== 'running' || ['STOPPED', 'PAUSED'].includes(ctx.project.state)) return null;
  await setProjectState(db, { projectId: ctx.project.id, state: 'WAITING_INPUT' });
  await notify(db, { projectId: ctx.project.id, kind: 'decision_needed',
    payload: { reason: `morphologie-invalide:${error}` } });
  return { ticked: true, blocked: true, reason: `morphologie-invalide:${error}` };
}

async function applyDecision(db, ctx, decision) {
  const runtimeOutcome = await applyRuntime(db, ctx);
  if (runtimeOutcome) return runtimeOutcome;
  if (decision.hold || !decision.event) return { state: ctx.project.state, note: decision.reason || 'maintien' };
  if (decision.event === 'dispatch') return dispatchReviewed(db, ctx);
  const next = nextState(ctx.project.state, decision.event);
  if (!next) {
    await notify(db, { projectId: ctx.project.id, kind: 'blocked', payload: { reason: 'transition-impossible' } });
    return { state: ctx.project.state, note: 'transition-impossible' };
  }
  await setProjectState(db, { projectId: ctx.project.id, state: next });
  for (const effect of decision.effects || []) await applyEffect(db, ctx, effect);
  if (next === 'STOPPED') await db.run("UPDATE ontogenesis_control SET mode = 'stopped' WHERE project_id = ?", [ctx.project.id]);
  return { state: next, event: decision.event };
}

async function applyRuntime(db, ctx) {
  if (!ctx.harness) return null;
  const halted = await haltForControl(db, ctx, ctx.harness);
  if (halted) return halted;
  const cancelled = await cancelBlockedTask(db, ctx);
  if (cancelled) return cancelled;
  if (['VERIFYING', 'INTEGRATING'].includes(ctx.project.state)) return processIntegration(db, ctx);
  return null;
}

async function consumeFirstOfType(db, projectId, type) {
  const events = await listPendingEvents(db, projectId);
  const found = events.find((event) => !type || event.type === type) || null;
  if (found) await consumeEvent(db, found.id);
  return found;
}

async function sleepingWake(ctx) {
  if (ctx.harness) return ctx.memoryLevel === 'normal' && ctx.memoryStable ? 'recovered' : null;
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


async function controlWithoutHarness(db, ctx) {
  if (!['paused', 'stopping', 'stopped'].includes(ctx.control?.mode)) return null;
  const decision = stepLoop(snapshotOf(ctx));
  const outcome = await applyDecision(db, ctx, decision);
  return { ...outcome, decision };
}

async function haltBeforePlanning(db, ctx) {
  if (!ctx.harness) return controlWithoutHarness(db, ctx);
  const halted = await haltForControl(db, ctx, ctx.harness);
  if (halted) return halted;
  return cancelBlockedTask(db, ctx);
}


async function prepareMissionContext(db, ctx, input) {
  ctx.mission = input.preparation.mission;
  ctx.mission.operatorContext = await operatorContext(db, ctx.project.id);
  ctx.mission.developmentalContext = await compileDevelopmentalContext(db, ctx.project);
  ctx.config.availableCapabilities = (ctx.config.availableCapabilities || []).filter(
    (capability) => ctx.mission.capabilities.includes(capability)
  );
  if (ctx.mission.morphology.selectedTopology) {
    ctx.config.topologies = [ctx.mission.morphology.selectedTopology];
  }
  ctx.mission.plan = buildMissionCapabilityPlan({
    project: ctx.project, task: ctx.selection.task || {}, mission: ctx.mission, config: ctx.config
  });
  return blockInvalidMission(db, ctx);
}

async function notifyExpiredQuestions(db, input) {
  const expired = await expireDue(db, { projectId: input.projectId });
  for (const questionId of expired) {
    await notify(db, { projectId: input.projectId, kind: 'decision_needed', payload: { reason: `question-expiree:${questionId}` } });
  }
}


async function loadClaimedContext(db, input, fence) {
  const project = await getProject(db, input.projectId);
  if (!preparationMatches(project, input.preparation)) return { changed: true };
  const tasks = await listTasks(db, input.projectId);
  await compileEmptyBacklog(db, project, { tasks, compiled: input.preparation.mission });
  await processInbox(db, input.projectId);
  const ctx = await loadContext(db, input);
  ctx.fence = fence;
  ctx.observedEvents = await observeEvents(db, input.projectId);
  return ctx;
}

async function tickClaimed(db, input, fence) {
  const fired = await fireDue(db, input.projectId, input.nowMs);
  await notifyExpiredQuestions(db, input);
  await require('../shev/runtimeService').tickProject(db, { projectId: input.projectId, fence });
  await require('../shev/initiativeService').compilePending(db, input);
  const ctx = await loadClaimedContext(db, input, fence);
  if (ctx.changed) return { ticked: false, reason: 'contexte-projet-modifie' };
  if (ctx.project.state === 'STOPPED') return { ticked: true, state: 'STOPPED', note: 'arrete' };
  if (ctx.harness) await reconcileExecution(db, ctx);
  const interrupted = await haltBeforePlanning(db, ctx);
  if (interrupted) {
    await acknowledgeObservedEvents(db, ctx, interrupted);
    return { ticked: true, ...interrupted };
  }
  if (!input.preparation.mission) return { ticked: false, reason: 'contexte-controle-modifie' };
  const blocked = await prepareMissionContext(db, ctx, input);
  if (blocked) return blocked;
  ctx.fence = fence;
  await fence();
  if (ctx.harness && ctx.project.state === 'EXECUTING') Object.assign(ctx, await observeExecution(db, ctx, ctx.harness));
  const wake = await reconcileWake(db, ctx);
  const decision = wake ? { event: wake, effects: [] } : stepLoop(snapshotOf(ctx));
  const outcome = await applyDecision(db, ctx, decision);
  await acknowledgeObservedEvents(db, ctx, outcome);
  return { ticked: true, fired, decision, ...outcome };
}

async function tickOnce(db, input) {
  await ensureTables(db);
  const occupied = await db.get("SELECT project_id FROM ontogenesis_claims WHERE project_id = ? AND julianday(expires_at) > julianday('now')", [input.projectId]);
  if (occupied) return { ticked: false, reason: 'claim-actif' };
  const preparation = await prepareMission(db, input.projectId);
  input = { ...input, preparation };
  const claim = await acquireClaim(db, { projectId: input.projectId, owner: input.owner, ttlMs: 120000 });
  if (!claim.acquired) return { ticked: false, reason: 'claim-actif' };
  const lease = { projectId: input.projectId, owner: input.owner, operationId: claim.operationId, ttlMs: 120000 };
  const fence = () => extendClaim(db, lease);
  const heartbeat = setInterval(() => { fence().catch(() => {}); }, 10000);
  heartbeat.unref();
  try {
    return await tickClaimed(db, input, fence);
  } finally {
    clearInterval(heartbeat);
    await releaseClaim(db, { projectId: input.projectId, owner: input.owner, operationId: claim.operationId });
  }
}

async function refreshExecutionContext(db, ctx) {
  if (ctx.harness && ctx.project.state === 'EXECUTING') Object.assign(ctx, await observeExecution(db, ctx, ctx.harness));
}

module.exports = { tickOnce };
