'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../db');
const { migrateMissionEpisodeRecovery } = require('../db/migrations/migrateMissionEpisodeRecovery');

const RECOVERABLE_RUNS = new Set(['planned', 'running', 'failed', 'blocked', 'cancelled']);
const RECOVERABLE_AUTHORITY = new Set(['launching', 'running', 'failed']);
const QUARANTINED_THREAD_STATES = [
  'embryonic', 'ready', 'active', 'waiting_signal', 'waiting_permission',
  'budget_quiescent', 'evidence_quiescent'
];

function failure(code, message, status = 409) {
  return Object.assign(new Error(message), { code, status });
}

function requiredScope(input) {
  if (!input?.organizationId || !input.projectId || !input.missionId || !input.episodeId) {
    throw failure('MISSION_EPISODE_RECOVERY_SCOPE_REQUIRED',
      'Organization, project, mission and episode are required.', 400);
  }
  return input;
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function recoveryId(episode) {
  const digest = crypto.createHash('sha256').update([
    episode.episode_id, episode.owner_run_id, episode.owner_generation
  ].join('\0')).digest('hex').slice(0, 32);
  return `episode_recovery_${digest}`;
}

function pidAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function formatReceipt(row) {
  if (!row) return null;
  return {
    receiptId: row.receipt_id, episodeId: row.episode_id, missionId: row.mission_id,
    organizationId: row.organization_id, projectId: row.project_id,
    ownerAgentId: row.owner_agent_id, ownerRunId: row.owner_run_id,
    ownerPid: row.owner_pid, runtimePid: row.runtime_pid,
    authorityGeneration: row.authority_generation,
    authorityTokenHash: row.authority_token_hash,
    observedAuthorityState: row.observed_authority_state,
    observedRunStatus: row.observed_run_status, outcome: row.outcome,
    quarantinedThreads: row.quarantined_threads, createdAt: row.created_at
  };
}

async function scopedEpisode(db, input) {
  const row = await db.get('SELECT * FROM mission_episodes WHERE episode_id = ?', input.episodeId);
  if (!row) throw failure('MISSION_EPISODE_NOT_FOUND', 'Mission episode was not found.', 404);
  if (row.organization_id !== input.organizationId || row.project_id !== input.projectId) {
    throw failure('MISSION_EPISODE_SCOPE_DENIED', 'Mission episode belongs to another tenant.', 403);
  }
  if (row.mission_id !== input.missionId) {
    throw failure('MISSION_EPISODE_MISSION_MISMATCH', 'Mission episode belongs to another mission.');
  }
  return row;
}

async function loadAuthority(db, episode) {
  return db.get(`SELECT agent_id, generation, token, state, owner_pid
    FROM mission_execution_authority WHERE mission_id = ?`, episode.mission_id);
}

async function loadRun(db, episode) {
  return db.get('SELECT id, agent_id, status FROM strategy_execution_runs WHERE id = ?',
    episode.owner_run_id);
}

function assertBindingEvidence(episode, authority, run) {
  if (!completeBinding(episode)) throw failure('MISSION_EPISODE_RECOVERY_BINDING_MISSING',
    'Episode has no complete persisted owner binding.');
  if (!authorityMatchesEpisode(authority, episode) || !runMatchesEpisode(run, episode)) {
    throw failure('MISSION_EPISODE_RECOVERY_EVIDENCE_MISMATCH',
      'Persisted owner authority or execution run no longer matches the episode.');
  }
}

function completeBinding(episode) {
  return Boolean(episode.owner_agent_id && episode.owner_run_id
    && Number.isSafeInteger(episode.owner_pid) && episode.owner_pid > 0
    && Number.isSafeInteger(episode.owner_generation) && episode.owner_generation > 0
    && episode.owner_authority_hash);
}

function authorityMatchesEpisode(authority, episode) {
  return authority && authority.agent_id === episode.owner_agent_id
    && authority.generation === episode.owner_generation
    && authority.owner_pid === episode.owner_pid
    && tokenHash(authority.token) === episode.owner_authority_hash;
}

function runMatchesEpisode(run, episode) {
  return run && run.id === episode.owner_run_id && run.agent_id === episode.owner_agent_id;
}

async function bindOwner(db, input) {
  requiredScope(input);
  await migrateMissionEpisodeRecovery(db);
  if (!input.orchestratorId || !input.executionRunId) {
    return { available: false, reason: 'MISSION_EPISODE_OWNER_RUN_UNAVAILABLE' };
  }
  return withTransaction(db, () => bindOwnerTransaction(db, input));
}

async function bindOwnerTransaction(db, input) {
  const episode = await scopedEpisode(db, input);
  if (episode.status !== 'active' || episode.orchestrator_id !== input.orchestratorId) {
    throw failure('MISSION_EPISODE_OWNER_BINDING_CONFLICT',
      'Only the active episode orchestrator can bind its runtime owner.');
  }
  const authority = await loadAuthority(db, episode);
  const run = await db.get('SELECT id, agent_id, status FROM strategy_execution_runs WHERE id = ?',
    input.executionRunId);
  const agent = await db.get('SELECT runtime_pid FROM agents WHERE id = ?', input.orchestratorId);
  if (!validBindingAuthority(authority, input.orchestratorId)
    || !validBindingRun(run, input.orchestratorId)) {
    throw failure('MISSION_EPISODE_OWNER_EVIDENCE_INVALID',
      'Owner authority and execution run must be current before binding.');
  }
  if (!Number.isSafeInteger(agent?.runtime_pid) || agent.runtime_pid <= 0) {
    return { available: false, reason: 'MISSION_EPISODE_RUNTIME_PID_UNAVAILABLE' };
  }
  const binding = {
    agentId: input.orchestratorId, runId: run.id, ownerPid: authority.owner_pid,
    runtimePid: agent.runtime_pid, generation: authority.generation,
    authorityHash: tokenHash(authority.token)
  };
  if (episode.owner_run_id) return assertExistingBinding(episode, binding);
  const result = await db.run(`UPDATE mission_episodes SET owner_agent_id = ?, owner_run_id = ?,
    owner_pid = ?, runtime_pid = ?, owner_generation = ?, owner_authority_hash = ?,
    owner_bound_at = CURRENT_TIMESTAMP, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
    WHERE episode_id = ? AND status = 'active' AND owner_run_id IS NULL`,
  binding.agentId, binding.runId, binding.ownerPid, binding.runtimePid,
  binding.generation, binding.authorityHash, episode.episode_id);
  if (result.changes !== 1) throw failure('MISSION_EPISODE_OWNER_BINDING_CONFLICT',
    'Episode owner binding changed concurrently.');
  return { available: true, ...binding };
}

function validBindingAuthority(authority, orchestratorId) {
  return authority && authority.agent_id === orchestratorId
    && ['launching', 'running'].includes(authority.state)
    && Number.isSafeInteger(authority.owner_pid) && authority.owner_pid > 0;
}

function validBindingRun(run, orchestratorId) {
  return run && run.agent_id === orchestratorId && ['planned', 'running'].includes(run.status);
}

function assertExistingBinding(episode, binding) {
  const exact = episode.owner_agent_id === binding.agentId
    && episode.owner_run_id === binding.runId && episode.owner_pid === binding.ownerPid
    && episode.runtime_pid === binding.runtimePid
    && episode.owner_generation === binding.generation
    && episode.owner_authority_hash === binding.authorityHash;
  if (!exact) throw failure('MISSION_EPISODE_OWNER_BINDING_CONFLICT',
    'Episode is already bound to another owner runtime.');
  return { available: true, ...binding, idempotent: true };
}

async function existingReceipt(db, input) {
  return db.get(`SELECT * FROM mission_episode_recovery_receipts
    WHERE episode_id = ? AND mission_id = ? AND organization_id = ? AND project_id = ?`,
  input.episodeId, input.missionId, input.organizationId, input.projectId);
}

function liveRuntimeReason(episode, agent) {
  if (pidAlive(episode.owner_pid)) return 'MISSION_EPISODE_OWNER_ALIVE';
  if (pidAlive(episode.runtime_pid)) return 'MISSION_EPISODE_RUNTIME_ALIVE';
  if (Number.isSafeInteger(agent?.runtime_pid) && agent.runtime_pid > 0
    && agent.runtime_pid !== episode.runtime_pid) return 'MISSION_EPISODE_RUNTIME_REPLACED';
  if (pidAlive(agent?.runtime_pid)) return 'MISSION_EPISODE_RUNTIME_ALIVE';
  return null;
}

function assertRecoverableState(episode, authority, run) {
  if (episode.status !== 'active') return 'MISSION_EPISODE_NOT_ACTIVE';
  if (!RECOVERABLE_AUTHORITY.has(authority.state) || !RECOVERABLE_RUNS.has(run.status)) {
    return 'MISSION_EPISODE_RUN_NOT_INTERRUPTED';
  }
  return null;
}

async function reconcile(db, input) {
  requiredScope(input);
  await migrateMissionEpisodeRecovery(db);
  return withTransaction(db, () => reconcileTransaction(db, input));
}

async function reconcileAbandoned(db) {
  await migrateMissionEpisodeRecovery(db);
  const episodes = await db.all(`SELECT episode_id, mission_id, organization_id, project_id
    FROM mission_episodes WHERE status = 'active' AND owner_run_id IS NOT NULL
    ORDER BY created_at, episode_id`);
  const results = [];
  for (const episode of episodes) {
    results.push(await reconcile(db, {
      episodeId: episode.episode_id, missionId: episode.mission_id,
      organizationId: episode.organization_id, projectId: episode.project_id
    }));
  }
  return results;
}

async function reconcileTransaction(db, input) {
  const receipt = await existingReceipt(db, input);
  if (receipt) return { recovered: true, idempotent: true, receipt: formatReceipt(receipt) };
  const episode = await scopedEpisode(db, input);
  const authority = await loadAuthority(db, episode);
  const run = await loadRun(db, episode);
  assertBindingEvidence(episode, authority, run);
  const stateReason = assertRecoverableState(episode, authority, run);
  if (stateReason) return { recovered: false, reason: stateReason };
  const agent = await db.get('SELECT runtime_pid FROM agents WHERE id = ?', episode.owner_agent_id);
  const aliveReason = liveRuntimeReason(episode, agent);
  if (aliveReason) return { recovered: false, reason: aliveReason };
  return persistRecovery(db, { episode, authority, run });
}

async function persistRecovery(db, evidence) {
  const { episode, authority, run } = evidence;
  const placeholders = QUARANTINED_THREAD_STATES.map(() => '?').join(',');
  const threadResult = await db.run(`UPDATE cell_threads SET status = 'quarantined',
    stop_reason = 'owner_runtime_interrupted', revision = revision + 1,
    updated_at = CURRENT_TIMESTAMP WHERE episode_id = ? AND mission_id = ?
    AND organization_id = ? AND project_id = ? AND status IN (${placeholders})`,
  episode.episode_id, episode.mission_id, episode.organization_id, episode.project_id,
  ...QUARANTINED_THREAD_STATES);
  await failRun(db, run);
  await failAuthority(db, authority, episode);
  const updated = await db.run(`UPDATE mission_episodes SET status = 'failed',
    revision = revision + 1, updated_at = CURRENT_TIMESTAMP
    WHERE episode_id = ? AND status = 'active' AND revision = ?`,
  episode.episode_id, episode.revision);
  if (updated.changes !== 1) throw failure('MISSION_EPISODE_RECOVERY_CONFLICT',
    'Episode changed while recovery was being recorded.');
  const receiptId = recoveryId(episode);
  await db.run(`INSERT INTO mission_episode_recovery_receipts
    (receipt_id, episode_id, mission_id, organization_id, project_id,
      owner_agent_id, owner_run_id, owner_pid, runtime_pid, authority_generation,
      authority_token_hash, observed_authority_state, observed_run_status,
      outcome, quarantined_threads) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      'interrupted_quarantined', ?)`,
  receiptId, episode.episode_id, episode.mission_id, episode.organization_id,
  episode.project_id, episode.owner_agent_id, episode.owner_run_id, episode.owner_pid,
  episode.runtime_pid, episode.owner_generation, episode.owner_authority_hash,
  authority.state, run.status, threadResult.changes);
  const receipt = await db.get('SELECT * FROM mission_episode_recovery_receipts WHERE receipt_id = ?',
    receiptId);
  return { recovered: true, idempotent: false, receipt: formatReceipt(receipt) };
}

async function failRun(db, run) {
  if (!['planned', 'running'].includes(run.status)) return;
  const result = await db.run(`UPDATE strategy_execution_runs SET status = 'failed',
    guardrail_reason = 'mission_episode_owner_interrupted', completed_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = ?`, run.id, run.status);
  if (result.changes !== 1) throw failure('MISSION_EPISODE_RECOVERY_RUN_CONFLICT',
    'Execution run changed while recovery was being recorded.');
}

async function failAuthority(db, authority, episode) {
  if (authority.state === 'failed') return;
  const result = await db.run(`UPDATE mission_execution_authority SET state = 'failed'
    WHERE mission_id = ? AND agent_id = ? AND generation = ? AND token = ?
      AND owner_pid = ? AND state = ?`, episode.mission_id, episode.owner_agent_id,
  authority.generation, authority.token, episode.owner_pid, authority.state);
  if (result.changes !== 1) throw failure('MISSION_EPISODE_RECOVERY_AUTHORITY_CONFLICT',
    'Mission authority changed while recovery was being recorded.');
}

async function getReceipt(db, input) {
  requiredScope(input);
  await migrateMissionEpisodeRecovery(db);
  await scopedEpisode(db, input);
  return formatReceipt(await existingReceipt(db, input));
}

module.exports = { bindOwner, reconcile, reconcileAbandoned, getReceipt };
