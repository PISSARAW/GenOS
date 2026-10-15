'use strict';

const crypto = require('node:crypto');
const episodes = require('./missionEpisodeService');
const threads = require('./cellThreadService');

function stableId(prefix, parts) {
  const digest = crypto.createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 32);
  return `${prefix}_${digest}`;
}

function requestedScope(request = {}) {
  const organizationId = request.organizationId || request.organization_id;
  const projectId = request.projectId || request.project_id;
  if (!organizationId && !projectId) return null;
  if (!organizationId || !projectId) {
    throw coded('Mission episode scope requires organization and project together.',
      'MISSION_EPISODE_SCOPE_INCOMPLETE');
  }
  return { organizationId, projectId };
}

function coded(message, code) {
  return Object.assign(new Error(message), { code });
}

async function persistedContext(db, input) {
  const row = await db.get(`SELECT a.workspace_id AS workspaceId,
      w.organization_id AS organizationId, w.project_id AS projectId,
      sc.id AS contractId, sc.contract_hash AS contractHash
    FROM agents a
    LEFT JOIN workspaces w ON w.id = a.workspace_id
    LEFT JOIN strategy_contracts sc ON sc.id = (
      SELECT latest.id FROM strategy_contracts latest
      WHERE latest.agent_id = a.id ORDER BY latest.version DESC LIMIT 1
    ) WHERE a.id = ?`, input.orchestratorId);
  if (!row) throw coded('Mission episode orchestrator was not found.', 'MISSION_EPISODE_ORCHESTRATOR_NOT_FOUND');
  return row;
}

function resolveScope(context, request) {
  const requested = requestedScope(request);
  const persisted = context.organizationId && context.projectId
    ? { organizationId: context.organizationId, projectId: context.projectId } : null;
  if (requested && persisted && (requested.organizationId !== persisted.organizationId
      || requested.projectId !== persisted.projectId)) {
    throw coded('Mission episode scope differs from the orchestrator workspace.',
      'MISSION_EPISODE_SCOPE_MISMATCH');
  }
  return persisted || requested;
}

function correlation(input, context, scope) {
  const episodeId = input.request.episodeId || input.request.episode_id
    || stableId('episode', [input.missionId, input.orchestratorId]);
  return {
    ...scope, missionId: input.missionId, episodeId,
    threadId: stableId('thread', [episodeId, input.orchestratorId]),
    workerId: input.orchestratorId, orchestratorId: input.orchestratorId,
    organismId: input.orchestratorId,
    organismRevision: context.contractId,
    contractHash: context.contractHash,
    action: input.action
  };
}

async function ensureEpisode(db, state) {
  let episode = await episodes.get(db, state);
  if (episode && episode.missionId !== state.missionId) {
    throw coded('Mission episode belongs to another mission.', 'MISSION_EPISODE_MISSION_MISMATCH');
  }
  if (!episode) {
    episode = await episodes.create(db, {
      ...state,
      metadata: { action: state.action, strategyContractHash: state.contractHash }
    });
  }
  return episode;
}

async function ensureRoot(db, state, episode) {
  let root = episode.rootThreadId
    ? await threads.get(db, { ...state, threadId: episode.rootThreadId }) : null;
  if (root && (root.missionId !== state.missionId || root.episodeId !== episode.episodeId
      || root.workerId !== state.orchestratorId)) {
    throw coded('Mission episode root thread has another runtime identity.',
      'MISSION_EPISODE_ROOT_MISMATCH');
  }
  if (!root) root = await threads.create(db, {
    ...state, cellKind: 'orchestrator', metadata: { runtime: 'genos-orchestrate' }
  });
  return root;
}

async function activate(db, input) {
  const { state, episode, root } = input;
  let activeRoot = root;
  if (activeRoot.status === 'embryonic') {
    activeRoot = await threads.transition(db, { ...state, threadId: root.threadId, status: 'ready' });
  }
  if (activeRoot.status === 'ready') {
    activeRoot = await threads.transition(db, { ...state, threadId: root.threadId, status: 'active' });
  }
  const activeEpisode = episode.status === 'embryonic'
    ? await episodes.transition(db, { ...state, status: 'active' }) : episode;
  return { episode: activeEpisode, rootThread: activeRoot };
}

async function ensure(db, input) {
  if (!input?.missionId || !input.orchestratorId) {
    throw coded('Mission and orchestrator identifiers are required.', 'MISSION_EPISODE_RUNTIME_INVALID');
  }
  const context = await persistedContext(db, input);
  const scope = resolveScope(context, input.request || {});
  if (!scope) return { available: false, reason: 'MISSION_EPISODE_SCOPE_UNAVAILABLE' };
  if (!context.contractId) {
    throw coded('Mission episode requires a persisted strategy contract.',
      'MISSION_EPISODE_ORGANISM_REVISION_UNAVAILABLE');
  }
  const state = correlation(input, context, scope);
  const episode = await ensureEpisode(db, state);
  const root = await ensureRoot(db, state, episode);
  const active = await activate(db, { state, episode, root });
  return { available: true, ...active, episodeId: active.episode.episodeId,
    rootThreadId: active.rootThread.threadId };
}

function propagate(request, runtime) {
  const reference = runtime.available
    ? { available: true, episodeId: runtime.episodeId, rootThreadId: runtime.rootThreadId }
    : { available: false, reason: runtime.reason };
  request.missionScope = { ...(request.missionScope || {}), ...reference };
  request.developmentalContext = {
    ...(request.developmentalContext || {}), missionEpisode: reference
  };
  return request;
}

module.exports = { ensure, propagate };
