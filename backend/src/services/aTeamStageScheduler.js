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

async function runStagePlan({ db, plan, launch, options = {} }) {
  const skip = new Set(options.skipWorkerIds || []);
  const sleep = options.sleep || defaultSleep;
  const now = options.now || Date.now;
  const index = domainIndex(plan);
  const results = [];
  for (let stage = 0; stage <= plan.maxStage; stage += 1) {
    const stageMembers = plan.members.filter((member) => member.pipelineStage === stage);
    const dependencyIds = [...new Set(stageMembers.flatMap((member) => dependencyWorkerIds(plan, member, index)))];
    if (dependencyIds.length) {
      const wait = await waitForWorkersTerminal(db, dependencyIds, {
        pollMs: options.pollMs, timeoutMs: options.timeoutMs, sleep, now
      });
      results.push({ stage, waitedFor: dependencyIds, timedOut: wait.timedOut, pendingWorkerIds: wait.pendingWorkerIds });
    }
    for (const member of stageMembers) {
      if (skip.has(member.workerId)) continue;
      await launch(member);
      results.push({ stage, launched: member.workerId, subSystem: member.subSystem });
    }
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
      budgetTokens: (request.execution_budget || request.executionBudget || {}).tokens,
      capabilitiesHint: member.capabilities,
    });
  } catch (_) {
    return { capabilities: [], capabilityManifest: null, toolLease: [] };
  }
}

function workerLaunchPayload({ plan, member, parentWorkspaceRoot, request = {} }) {
  const launchCaps = launchCapabilities(member, request);
  return {
    action: 'dispatch_worker',
    background: false,
    orchestratorId: plan.orchestratorId,
    workerId: member.workerId,
    mission: member.mission,
    role: member.role,
    model_tier: member.modelTier,
    ...(member.dependsOn.length ? { depends_on: member.dependsOn } : {}),
    ...(member.pipelineStage ? { pipeline_stage: member.pipelineStage } : {}),
    capabilities: launchCaps.capabilities,
    capabilityManifest: launchCaps.capabilityManifest,
    toolLease: launchCaps.toolLease,
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
