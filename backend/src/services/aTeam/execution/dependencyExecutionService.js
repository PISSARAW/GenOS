'use strict';

const TERMINAL = new Set(['completed', 'failed', 'error', 'terminated', 'apoptosis', 'blocked', 'unverified', 'timed_out', 'timeout']);

async function workerStatuses(db, members) {
  const entries = await Promise.all(members.map(async (member) => {
    const row = await db.get('SELECT status FROM agents WHERE id = ?', member.workerId);
    return [member.workerId, row?.status || 'missing'];
  }));
  return new Map(entries);
}

function dependencyState(member, context) {
  const ids = member.dependsOn.map((domain) => context.domains.get(domain));
  const failures = ids.filter((id) => context.blocked.has(id) || (TERMINAL.has(context.statuses.get(id)) && context.statuses.get(id) !== 'completed'));
  if (failures.length) return { blocked: true, ids, failures, reason: 'dependency_failure' };
  return { ready: ids.every((id) => context.statuses.get(id) === 'completed'), ids };
}

async function processMember(member, context) {
  const state = dependencyState(member, context);
  if (!state.ready && !state.blocked && !context.expired) return false;
  if (!state.ready) return blockMember(member, context, state);
  try {
    if (await context.launch(member) === false) return blockMember(member, context, { ...state, reason: 'dependency_evidence_unavailable' });
    context.results.push({ stage: member.pipelineStage, launched: member.workerId, subSystem: member.subSystem });
  } catch (error) {
    return blockMember(member, context, { ...state, reason: 'launch_failed', error: error.message });
  }
  return true;
}

async function blockMember(member, context, state) {
  context.blocked.add(member.workerId);
  const result = {
    stage: member.pipelineStage, status: 'blocked', blockedWorker: member.workerId,
    failedDependencies: state.failures || state.ids,
    reason: state.reason || 'dependency_timeout', timedOut: !state.reason,
    error: state.error || null
  };
  context.results.push(result);
  if (context.options.onBlocked) await context.options.onBlocked(member, result);
  return true;
}

async function runDependencyGraph(input) {
  const options = executionOptions(input.options);
  const { now, sleep, timeoutMs } = options;
  const startedAt = now();
  const skip = new Set(options.skipWorkerIds);
  const pending = new Map(input.plan.members.filter((member) => !skip.has(member.workerId)).map((member) => [member.workerId, member]));
  const context = {
    options, launch: input.launch, blocked: new Set(), results: [],
    domains: new Map(input.plan.members.map((member) => [member.subSystem, member.workerId]))
  };
  while (pending.size) {
    context.statuses = await workerStatuses(input.db, input.plan.members);
    context.expired = now() - startedAt >= timeoutMs;
    if (options.onTick) await options.onTick();
    let progressed = false;
    for (const member of pending.values()) {
      if (!await processMember(member, context)) continue;
      pending.delete(member.workerId);
      progressed = true;
    }
    if (pending.size && !progressed) await sleep(options.pollMs ?? 500);
  }
  return context.results;
}

function executionOptions(options = {}) {
  return { ...options, now: options.now || Date.now,
    sleep: options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    timeoutMs: options.timeoutMs ?? 15 * 60 * 1000, skipWorkerIds: options.skipWorkerIds || [] };
}

module.exports = { TERMINAL, workerStatuses, runDependencyGraph };
