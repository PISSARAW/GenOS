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

function defaultSleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function memberId(orchestratorId, planId, index) {
  return `worker_${orchestratorId}_${planId}_${index}`;
}

function withDefault(value, fallback) {
  return value === undefined || value === null ? fallback : value;
}

// Deterministic plan: the launcher and the runner derive the same worker ids.
function plannedMember({ member, index, orchestratorId, planId }) {
  const workerId = member.workerId || memberId(orchestratorId, planId, index);
  return {
    index,
    subSystem: withDefault(member.subSystem, withDefault(member.label, withDefault(member.role, `member_${index}`))),
    role: member.role,
    workerKind: member.workerKind,
    workerKindReason: member.workerKindReason,
    agentId: withDefault(member.agentId, workerId),
    label: member.label,
    modelTier: member.modelTier,
    executionBudgetTokens: member.executionBudgetTokens,
    mission: member.mission,
    requiredArtifacts: withDefault(member.requiredArtifacts, withDefault(member.outputs, [])),
    outputs: withDefault(member.outputs, []),
    outputSchema: withDefault(member.outputSchema, null),
    acceptanceCriteria: withDefault(member.acceptanceCriteria, []),
    capabilities: withDefault(member.capabilities, []),
    dependsOn: [...new Set((Array.isArray(member.dependsOn) ? member.dependsOn : []).map(String))],
    pipelineStage: Math.max(0, Number(member.pipelineStage) || 0),
    workerId
  };
}

function stagePlanFor({ orchestratorId, members, planId } = {}) {
  const id = planId ?? `ateam_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const planned = (Array.isArray(members) ? members : []).map((member, index) => plannedMember({ member, index, orchestratorId, planId: id }));
  return validateAndStageGraph({ planId: id, orchestratorId, maxStage: 0, members: planned });
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

function validateAndStageGraph(plan) {
  const membersByDomain = new Map();
  const remainingDependencies = new Map();
  const consumersByDomain = new Map();
  const stages = new Map();
  for (const member of plan.members) {
    if (membersByDomain.has(member.subSystem)) {
      throw Object.assign(new Error(`Duplicate A-Team domain '${member.subSystem}'.`), { code: 'A_TEAM_DUPLICATE_DOMAIN' });
    }
    membersByDomain.set(member.subSystem, member);
    consumersByDomain.set(member.subSystem, []);
    stages.set(member.subSystem, member.pipelineStage);
  }
  for (const member of plan.members) {
    for (const dependency of member.dependsOn) {
      if (!membersByDomain.has(dependency)) {
        throw Object.assign(new Error(`Unknown A-Team dependency '${dependency}' for '${member.subSystem}'.`), { code: 'A_TEAM_UNKNOWN_DEPENDENCY' });
      }
      consumersByDomain.get(dependency).push(member.subSystem);
    }
    remainingDependencies.set(member.subSystem, member.dependsOn.length);
  }
  const ready = plan.members.filter((member) => remainingDependencies.get(member.subSystem) === 0);
  let visited = 0;
  while (ready.length) {
    const producer = ready.shift();
    visited += 1;
    for (const consumerDomain of consumersByDomain.get(producer.subSystem)) {
      stages.set(consumerDomain, Math.max(stages.get(consumerDomain), stages.get(producer.subSystem) + 1));
      const remaining = remainingDependencies.get(consumerDomain) - 1;
      remainingDependencies.set(consumerDomain, remaining);
      if (remaining === 0) ready.push(membersByDomain.get(consumerDomain));
    }
  }
  if (visited !== plan.members.length) {
    throw Object.assign(new Error('A-Team dependencies must form an acyclic graph.'), { code: 'A_TEAM_DEPENDENCY_CYCLE' });
  }
  plan.members = plan.members.map((member) => ({ ...member, pipelineStage: stages.get(member.subSystem) }));
  plan.maxStage = plan.members.reduce((max, member) => Math.max(max, member.pipelineStage), 0);
  return plan;
}

async function isTerminal(db, workerId) {
  const row = await db.get('SELECT status FROM agents WHERE id = ?', workerId);
  if (!row) return false;
  return TERMINAL.has(String(row.status));
}

async function waitForWorkersTerminal(db, workerIds, options = {}) {
  const pollMs = Number(options.pollMs) || 500;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Number(options.timeoutMs) : 15 * 60 * 1000;
  const sleep = options.sleep || defaultSleep;
  const now = options.now || Date.now;
  const startedAt = now();
  const pending = new Set(workerIds);
  while (pending.size && (now() - startedAt) < timeoutMs) {
    for (const workerId of [...pending]) {
      if (await isTerminal(db, workerId)) pending.delete(workerId);
    }
    if (pending.size) await sleep(pollMs);
  }
  return { timedOut: pending.size > 0, pendingWorkerIds: [...pending], elapsedMs: now() - startedAt };
}

async function dependencyStatusSnapshot(db, dependencyIds) {
  const entries = await Promise.all(dependencyIds.map(async (workerId) => {
    const row = await db.get('SELECT status FROM agents WHERE id = ?', workerId);
    return [workerId, row?.status || 'missing'];
  }));
  return new Map(entries);
}

async function waitForStageDependencies(context) {
  const { db, dependencyIds, options, sleep, now } = context;
  const wait = await waitForWorkersTerminal(db, dependencyIds, {
    pollMs: options.pollMs, timeoutMs: options.timeoutMs, sleep, now
  });
  return {
    timedOut: wait.timedOut,
    pendingWorkerIds: wait.pendingWorkerIds,
    statuses: await dependencyStatusSnapshot(db, dependencyIds)
  };
}

async function launchStageMembers({ stageMembers, plan, index, statuses, timedOut, skip, launch, stage }) {
  const results = [];
  for (const member of stageMembers) {
    if (skip.has(member.workerId)) continue;
    const failedDependencies = dependencyWorkerIds(plan, member, index)
      .filter((workerId) => statuses.get(workerId) !== 'completed');
    if (failedDependencies.length) {
      results.push({ stage, status: 'blocked', blockedWorker: member.workerId, failedDependencies, reason: timedOut ? 'dependency_timeout' : 'dependency_failure' });
      continue;
    }
    if (await launch(member) === false) {
      results.push({ stage, status: 'blocked', blockedWorker: member.workerId, failedDependencies: member.dependsOn, reason: 'dependency_evidence_unavailable' });
      continue;
    }
    results.push({ stage, launched: member.workerId, subSystem: member.subSystem });
  }
  return results;
}

async function runStagePlan({ db, plan, launch, options = {} }) {
  const skip = new Set(options.skipWorkerIds || []);
  const index = domainIndex(plan);
  const results = [];
  for (let stage = 0; stage <= plan.maxStage; stage += 1) {
    const stageMembers = plan.members.filter((member) => member.pipelineStage === stage);
    const dependencyIds = [...new Set(stageMembers.flatMap((member) => dependencyWorkerIds(plan, member, index)))];
    const wait = dependencyIds.length
      ? await waitForStageDependencies({ db, dependencyIds, options, sleep: options.sleep || defaultSleep, now: options.now || Date.now })
      : { timedOut: false, pendingWorkerIds: [], statuses: new Map() };
    if (dependencyIds.length) results.push({ stage, waitedFor: dependencyIds, timedOut: wait.timedOut, pendingWorkerIds: wait.pendingWorkerIds });
    results.push(...await launchStageMembers({ stageMembers, plan, index, statuses: wait.statuses, timedOut: wait.timedOut, skip, launch, stage }));
  }
  return results;
}

function launchCapabilities(member, request) {
  try {
    const { buildLaunchCapabilities } = require('./agents/agentIncarnationPayloadService');
    return buildLaunchCapabilities({
      role: member.role,
      prompt: member.mission,
      domain: request.domain,
      mode: request.mode,
      organization: request.organization,
      budgetTokens: Number.isFinite(member.executionBudgetTokens) ? member.executionBudgetTokens : (request.execution_budget || request.executionBudget || {}).tokens,
      capabilitiesHint: member.capabilities,
    });
  } catch (_) {
    return { capabilities: [], capabilityManifest: null, toolLease: [] };
  }
}

function workerLaunchPayload({ plan, member, parentWorkspaceRoot, request = {} }) {
  const launchCaps = launchCapabilities(member, request);
  const budget = request.execution_budget || request.executionBudget;
  const executionBudget = Number.isFinite(member.executionBudgetTokens)
    ? { ...(budget || {}), tokens: member.executionBudgetTokens }
    : budget;
  return {
    action: 'dispatch_worker',
    background: false,
    orchestratorId: plan.orchestratorId,
    workerId: member.workerId,
    mission: member.mission,
    handoffContext: Array.isArray(member.handoffContext) ? member.handoffContext : [],
    role: member.role,
    model_tier: member.modelTier,
    ...(member.dependsOn.length ? { depends_on: member.dependsOn } : {}),
    ...(member.pipelineStage ? { pipeline_stage: member.pipelineStage } : {}),
    capabilities: launchCaps.capabilities,
    capabilityManifest: launchCaps.capabilityManifest,
    toolLease: launchCaps.toolLease,
    execution_budget: executionBudget,
    timeoutMs: request.timeoutMs,
    workspace_root: request.workspace_root || parentWorkspaceRoot,
    reuseChecked: true,
    reuseWorkerId: member.workerId,
    executor: request.executor || process.env.GENOS_AGENT_EXECUTOR
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
