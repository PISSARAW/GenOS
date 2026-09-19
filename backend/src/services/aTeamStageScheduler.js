'use strict';

/**
 * @file aTeamStageScheduler.js
 * @description Real blocking stage scheduler for the A-Team. The detached
 * worker model only allows fire-and-forget dispatch, so a stage consumer was
 * launched in parallel with its producers. This module builds a deterministic
 * stage plan (stable worker ids) and runs it: every stage waits until all the
 * workers it depends on reach a terminal state before launching its members.
 */

const TERMINAL_STATUSES = Object.freeze([
  'completed', 'failed', 'error', 'terminated', 'apoptosis', 'blocked', 'unverified'
]);
const TERMINAL = new Set(TERMINAL_STATUSES);
const coordination = require('./aTeamCoordinationService');

function defaultSleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function memberId(orchestratorId, planId, index) {
  return `worker_${orchestratorId}_${planId}_${index}`;
}

// Deterministic plan: the launcher and the runner derive the same worker ids.
function stagePlanFor({ orchestratorId, members, planId } = {}) {
  const id = planId || `ateam_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const planned = (Array.isArray(members) ? members : []).map((member, index) => ({
    index,
    subSystem: member.subSystem || member.label || member.role || `member_${index}`,
    role: member.role,
    modelTier: member.modelTier,
    mission: member.mission,
    dependsOn: [...new Set((Array.isArray(member.dependsOn) ? member.dependsOn : []).map(String))],
    pipelineStage: Math.max(0, Number(member.pipelineStage) || 0),
    workerId: member.workerId || memberId(orchestratorId, id, index)
  }));
  const maxStage = planned.reduce((max, member) => Math.max(max, member.pipelineStage), 0);
  return { planId: id, orchestratorId, maxStage, members: planned };
}

function domainIndex(plan) {
  const map = new Map();
  for (const member of plan.members) {
    if (!map.has(member.subSystem)) map.set(member.subSystem, member.workerId);
  }
  return map;
}

function dependencyWorkerIds(plan, member, index) {
  const lookup = index || domainIndex(plan);
  return member.dependsOn.map((domain) => lookup.get(domain)).filter(Boolean);
}

async function workerStatus(db, workerId) {
  const row = await db.get('SELECT status FROM agents WHERE id = ?', workerId);
  return row ? String(row.status) : null;
}

async function collectTerminalWorkers(db, pending, failed) {
  for (const workerId of [...pending]) {
    const status = await workerStatus(db, workerId);
    if (!status || !TERMINAL.has(status)) continue;
    pending.delete(workerId);
    if (status !== 'completed') failed.add(workerId);
  }
}

async function waitForWorkersTerminal(db, workerIds, options = {}) {
  const pollMs = Number(options.pollMs) || 500;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Number(options.timeoutMs) : 15 * 60 * 1000;
  const sleep = options.sleep || defaultSleep;
  const now = options.now || Date.now;
  const startedAt = now();
  const pending = new Set(workerIds);
  const failed = new Set();
  while (pending.size && (now() - startedAt) < timeoutMs) {
    await collectTerminalWorkers(db, pending, failed);
    if (pending.size) await sleep(pollMs);
  }
  return {
    timedOut: pending.size > 0, pendingWorkerIds: [...pending], failedWorkerIds: [...failed],
    elapsedMs: now() - startedAt
  };
}

function invalidDependencies(plan, members) {
  const byDomain = new Map(plan.members.map((member) => [member.subSystem, member]));
  return members.flatMap((member) => member.dependsOn.filter((domain) => {
    const dependency = byDomain.get(domain);
    return !dependency || dependency.pipelineStage >= member.pipelineStage;
  }).map((domain) => ({ member: member.subSystem, domain })));
}

async function runStagePlan({ db, plan, launch, options = {} }) {
  const skip = new Set(options.skipWorkerIds || []);
  const results = [];
  for (let stage = 0; stage <= plan.maxStage; stage += 1) {
    results.push(...await runStage({ db, plan, stage, skip, launch, options }));
  }
  return results;
}

async function runStage(input) {
  const members = input.plan.members.filter((member) => member.pipelineStage === input.stage);
  const invalid = invalidDependencies(input.plan, members);
  if (invalid.length) return [{ stage: input.stage, blocked: true, reason: 'invalid_dependencies', invalidDependencies: invalid }];
  const waitResult = await waitForDependencies(input, members);
  if (waitResult && waitResult.blocked) return [waitResult];
  return launchStageMembers(input, members);
}

async function waitForDependencies(input, members) {
  const index = domainIndex(input.plan);
  const dependencyIds = [...new Set(members.flatMap((member) => dependencyWorkerIds(input.plan, member, index)))];
  if (!dependencyIds.length) return null;
  const wait = await waitForWorkersTerminal(input.db, dependencyIds, input.options);
  const blocked = wait.timedOut || wait.failedWorkerIds.length > 0;
  return {
    stage: input.stage, waitedFor: dependencyIds, timedOut: wait.timedOut,
    pendingWorkerIds: wait.pendingWorkerIds, failedWorkerIds: wait.failedWorkerIds, blocked,
    ...(blocked ? { reason: wait.timedOut ? 'dependency_timeout' : 'dependency_failed' } : {})
  };
}

async function launchStageMembers(input, members) {
  const results = [];
  for (const member of members) {
    if (input.skip.has(member.workerId)) continue;
    await input.launch(member);
    results.push({ stage: input.stage, launched: member.workerId, subSystem: member.subSystem });
  }
  return results;
}

function workerLaunchPayload({ plan, member, parentWorkspaceRoot, request = {} }) {
  const handoffs = (Array.isArray(plan.handoffs) ? plan.handoffs : []).filter((handoff) => handoff.to === member.subSystem);
  if (handoffs.some((handoff) => !coordination.evaluateHandoff(handoff).triggered)) {
    throw Object.assign(new Error(`A-Team rejected an invalid handoff for '${member.subSystem}'.`), { code: 'A_TEAM_INVALID_HANDOFF' });
  }
  const handoffContext = handoffs.length
    ? `\nValidated dependency handoffs: ${handoffs.map((handoff) => handoff.content).join('; ')}`
    : '';
  return {
    action: 'dispatch_worker',
    background: false,
    orchestratorId: plan.orchestratorId,
    workerId: member.workerId,
    mission: `${member.mission || ''}${handoffContext}`,
    role: member.role,
    model_tier: member.modelTier,
    ...(member.dependsOn.length ? { depends_on: member.dependsOn } : {}),
    ...(handoffs.length ? { handoff_signals: handoffs } : {}),
    ...(member.pipelineStage ? { pipeline_stage: member.pipelineStage } : {}),
    execution_budget: request.execution_budget || request.executionBudget,
    timeoutMs: request.timeoutMs,
    workspace_root: request.workspace_root || parentWorkspaceRoot,
    reuseChecked: true
  };
}

module.exports = {
  TERMINAL_STATUSES,
  stagePlanFor,
  dependencyWorkerIds,
  waitForWorkersTerminal,
  runStagePlan,
  workerLaunchPayload
};
