'use strict';

const crypto = require('node:crypto');
const threads = require('./cellThreadService');
const { migrateMissionEpisodes } = require('../db/migrations/migrateMissionEpisodes');

function coded(message, code) {
  return Object.assign(new Error(message), { code });
}

function stableThreadId(input) {
  const digest = crypto.createHash('sha256')
    .update([input.episodeId, input.parentThreadId, input.workerId].join('\0'))
    .digest('hex').slice(0, 32);
  return `thread_${digest}`;
}

function requestedCorrelation(input) {
  const scope = input.missionScope || {};
  if (scope.available === false) return null;
  const episodeId = input.episodeId || scope.episodeId;
  const parentThreadId = input.parentThreadId || scope.rootThreadId;
  if (!episodeId && !parentThreadId) return null;
  if (!episodeId || !parentThreadId) {
    throw coded('Worker cell correlation requires episode and parent thread together.',
      'WORKER_CELL_CORRELATION_INCOMPLETE');
  }
  return { episodeId, parentThreadId };
}

async function loadRoot(db, input) {
  const root = await db.get(`SELECT thread_id, episode_id, mission_id, organization_id,
      project_id, parent_thread_id, worker_id, cell_kind, status
    FROM cell_threads WHERE thread_id = ?`, input.parentThreadId);
  if (!root) throw coded('Worker cell parent thread was not found.', 'WORKER_CELL_PARENT_NOT_FOUND');
  const exact = root.episode_id === input.episodeId && root.mission_id === input.missionId
    && root.worker_id === input.orchestratorId && root.parent_thread_id === null
    && root.cell_kind === 'orchestrator';
  if (!exact) {
    throw coded('Worker cell parent belongs to another mission, episode or orchestrator.',
      'WORKER_CELL_PARENT_COLLISION');
  }
  return root;
}

function identity(root, input) {
  return {
    missionId: input.missionId, episodeId: input.episodeId,
    organizationId: root.organization_id, projectId: root.project_id,
    parentThreadId: root.thread_id, workerId: input.workerId,
    threadId: stableThreadId({ episodeId: input.episodeId,
      parentThreadId: root.thread_id, workerId: input.workerId })
  };
}

function sameIdentity(thread, expected) {
  return thread.threadId === expected.threadId
    && thread.episodeId === expected.episodeId && thread.missionId === expected.missionId
    && thread.parentThreadId === expected.parentThreadId
    && thread.workerId === expected.workerId && thread.cellKind === 'worker'
    && thread.organizationId === expected.organizationId
    && thread.projectId === expected.projectId;
}

async function existingForWorker(db, expected) {
  const row = await db.get(`SELECT thread_id FROM cell_threads
    WHERE episode_id = ? AND worker_id = ?`, expected.episodeId, expected.workerId);
  if (!row) return null;
  return threads.get(db, { ...expected, threadId: row.thread_id });
}

async function createOrReuse(db, expected, metadata) {
  let current = await threads.get(db, expected);
  if (!current) current = await existingForWorker(db, expected);
  if (current && !sameIdentity(current, expected)) {
    throw coded('Worker already has a different cell identity in this episode.',
      'WORKER_CELL_IDENTITY_COLLISION');
  }
  if (!current) {
    try {
      current = await threads.create(db, {
        ...expected, cellKind: 'worker', metadata
      });
    } catch (error) {
      if (!String(error?.message || '').includes('UNIQUE constraint failed')) throw error;
      current = await threads.get(db, expected);
      if (!current || !sameIdentity(current, expected)) throw error;
    }
  }
  return current;
}

async function ready(db, expected, current) {
  if (current.status === 'embryonic') {
    return threads.transition(db, { ...expected, status: 'ready' });
  }
  if (['ready', 'active', 'waiting_signal', 'waiting_permission',
    'budget_quiescent', 'evidence_quiescent', 'completed_execution'].includes(current.status)) {
    return current;
  }
  throw coded(`Worker cell cannot be dispatched from status '${current.status}'.`,
    'WORKER_CELL_DISPATCH_TERMINAL');
}

async function ensureDispatched(db, input) {
  if (!input?.missionId || !input.workerId || !input.orchestratorId) {
    throw coded('Worker cell dispatch requires mission, orchestrator and worker identities.',
      'WORKER_CELL_DISPATCH_INVALID');
  }
  const correlation = requestedCorrelation(input);
  if (!correlation) return { available: false, reason: 'MISSION_EPISODE_SCOPE_UNAVAILABLE' };
  await migrateMissionEpisodes(db);
  const state = { ...input, ...correlation };
  const root = await loadRoot(db, state);
  const expected = identity(root, state);
  const current = await createOrReuse(db, expected, {
    source: input.source || 'worker_dispatch',
    dispatchActionId: input.dispatchActionId || null
  });
  const thread = await ready(db, expected, current);
  return { available: true, episodeId: expected.episodeId,
    rootThreadId: expected.parentThreadId, threadId: expected.threadId, thread };
}

function propagate(mission, runtime) {
  const reference = runtime.available ? {
    available: true, episodeId: runtime.episodeId,
    rootThreadId: runtime.rootThreadId, threadId: runtime.threadId
  } : { available: false, reason: runtime.reason };
  mission.missionScope = { ...(mission.missionScope || {}), ...reference };
  mission.developmentalContext = {
    ...(mission.developmentalContext || {}), workerCellThread: reference
  };
  if (runtime.available) {
    mission.episodeId = runtime.episodeId;
    mission.threadId = runtime.threadId;
  }
  return mission;
}

function activationReference(input) {
  if (input.executionMode !== 'worker') return { unavailable: 'NOT_A_WORKER' };
  const correlation = requestedCorrelation(input);
  const threadId = input.threadId || input.missionScope?.threadId;
  if (!correlation && !threadId) return { unavailable: 'MISSION_EPISODE_SCOPE_UNAVAILABLE' };
  if (!correlation || !threadId) {
    throw coded('Worker activation requires an exact episode and thread.',
      'WORKER_CELL_CORRELATION_INCOMPLETE');
  }
  return { correlation, threadId };
}

function assertActivationIdentity(current, expected) {
  const exact = current.thread_id === expected.threadId
    && current.episode_id === expected.correlation.episodeId
    && current.parent_thread_id === expected.correlation.parentThreadId
    && current.worker_id === expected.workerId && current.cell_kind === 'worker';
  if (!exact) throw coded('Worker runtime does not match its dispatched cell.',
    'WORKER_CELL_RUNTIME_COLLISION');
}

async function advanceToActive(db, input) {
  let thread = await threads.get(db, { ...input, threadId: input.threadId });
  if (thread.status === 'embryonic') {
    thread = await threads.transition(db, { ...input, status: 'ready' });
  }
  if (thread.status === 'ready') {
    thread = await threads.transition(db, { ...input, status: 'active' });
  }
  if (thread.status !== 'active') {
    throw coded(`Worker cell cannot activate from status '${thread.status}'.`,
      'WORKER_CELL_RUNTIME_TERMINAL');
  }
  return thread;
}

async function activate(db, input) {
  const reference = activationReference(input);
  if (reference.unavailable) return { available: false, reason: reference.unavailable };
  const { correlation, threadId } = reference;
  const current = await threads.requireScoped(db, {
    threadId, missionId: input.missionId,
    organizationId: input.organizationId, projectId: input.projectId
  });
  assertActivationIdentity(current, { correlation, threadId, workerId: input.workerId });
  const thread = await advanceToActive(db, { ...input, threadId });
  return { available: true, episodeId: correlation.episodeId, threadId, thread };
}

async function failDispatch(db, runtime, reason) {
  if (!runtime?.available) return runtime;
  const thread = await threads.get(db, {
    threadId: runtime.threadId,
    organizationId: runtime.thread.organizationId,
    projectId: runtime.thread.projectId
  });
  if (!thread || !['embryonic', 'ready', 'active'].includes(thread.status)) return runtime;
  const failed = await threads.transition(db, {
    threadId: runtime.threadId, missionId: thread.missionId,
    organizationId: thread.organizationId, projectId: thread.projectId,
    status: 'failed', stopReason: String(reason || 'worker_dispatch_failed').slice(0, 1000)
  });
  return { ...runtime, thread: failed };
}

function outcomeStatus(status) {
  if (status === 'completed') return 'completed_execution';
  if (status === 'unverified') return 'evidence_quiescent';
  if (status === 'failed' || status === 'error') return 'failed';
  if (status === 'blocked') return 'quarantined';
  return null;
}

function assertOutcomeIdentity(row, input) {
  const episodeMatches = !input.episodeId || row.episode_id === input.episodeId;
  const exact = row.worker_id === input.workerId
    && row.mission_id === input.missionId && episodeMatches;
  if (!exact) throw coded('Observed worker outcome has another cell identity.',
    'WORKER_CELL_RUNTIME_COLLISION');
}

function formattedRow(db, row) {
  return threads.get(db, {
    threadId: row.thread_id, organizationId: row.organization_id,
    projectId: row.project_id
  });
}

async function observeOutcome(db, input) {
  if (input.executionMode !== 'worker') return null;
  if (!input.threadId) return null;
  const row = await db.get('SELECT * FROM cell_threads WHERE thread_id = ?', input.threadId);
  if (!row) throw coded('Observed worker cell was not found.', 'WORKER_CELL_NOT_FOUND');
  assertOutcomeIdentity(row, input);
  const target = outcomeStatus(input.status);
  if (!target) return formattedRow(db, row);
  if (row.status === target) return formattedRow(db, row);
  return threads.transition(db, {
    threadId: row.thread_id, missionId: row.mission_id,
    organizationId: row.organization_id, projectId: row.project_id,
    status: target, stopReason: input.reason || input.status
  });
}

module.exports = { ensureDispatched, propagate, activate, failDispatch,
  observeOutcome, stableThreadId };
