const crypto = require('crypto');

const KIND = 'genos-local-runtime';
const VERSION = 1;
const SAFE_PHASES = new Set(['prepared', 'generated', 'evaluated']);
const MAX_REPLY_BYTES = 1024 * 1024;

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function parse(row) {
  if (!row || row.reason !== 'local-runtime-checkpoint') return null;
  let checkpoint;
  try { checkpoint = JSON.parse(row.state_json || '{}').checkpoint; }
  catch (_) { throw invalid('Local runtime checkpoint JSON is invalid.'); }
  assertShape(checkpoint);
  return checkpoint;
}

function assertShape(checkpoint) {
  if (checkpoint?.kind !== KIND || checkpoint.version !== VERSION
    || !/^[a-f0-9]{64}$/.test(checkpoint.promptHash || '')
    || !['prepared', 'inference', 'generated', 'evaluating', 'evaluated', 'completed'].includes(checkpoint.phase)) {
    throw invalid('Local runtime checkpoint contract is invalid.');
  }
  if (checkpoint.reply != null && typeof checkpoint.reply !== 'string') {
    throw invalid('Local runtime checkpoint reply is invalid.');
  }
  assertReply(checkpoint);
}

function assertReply(checkpoint) {
  if (checkpoint.reply && Buffer.byteLength(checkpoint.reply) > MAX_REPLY_BYTES) {
    throw invalid('Local runtime checkpoint reply exceeds the limit.');
  }
  if (['generated', 'evaluating', 'evaluated', 'completed'].includes(checkpoint.phase)
    && !checkpoint.reply) throw invalid('Local runtime checkpoint reply is missing.');
}

function invalid(message) {
  return Object.assign(new Error(message), { code: 'LOCAL_RUNTIME_CHECKPOINT_INVALID', status: 409 });
}

function captured(row) {
  const checkpoint = parse(row);
  if (checkpoint && !SAFE_PHASES.has(checkpoint.phase) && checkpoint.phase !== 'completed') {
    throw Object.assign(new Error('Local runtime stopped inside an inference or external effect.'),
      { code: 'LOCAL_RUNTIME_CHECKPOINT_UNSAFE', status: 409 });
  }
  return checkpoint;
}

function resumable(row) {
  const checkpoint = parse(row);
  return checkpoint && SAFE_PHASES.has(checkpoint.phase) ? checkpoint : null;
}

async function assertResumeRequest(db, input) {
  if (!input.checkpointId) return null;
  if (typeof input.checkpointId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(input.checkpointId)) {
    throw invalid('Local runtime checkpoint identifier is invalid.');
  }
  if (!input.localRuntime) {
    throw Object.assign(new Error('This checkpoint requires the local GenOS runtime.'),
      { code: 'LOCAL_RUNTIME_CHECKPOINT_ADAPTER_REQUIRED', status: 409 });
  }
  const row = await db.get('SELECT * FROM agent_runtime_state WHERE id = ? AND agent_id = ?',
    input.checkpointId, input.agentId);
  if (!row || row.workspace_id !== input.workspaceId || !resumable(row)) {
    throw invalid('No resumable local runtime checkpoint belongs to this agent and workspace.');
  }
  return row;
}

async function load(state) {
  if (!state.mission.resumeCheckpointId) return null;
  if (!state.mission.runtimeCheckpointEnabled) throw invalid('Runtime checkpoint capability is disabled.');
  const db = await require('../db').getDatabase();
  const row = await assertResumeRequest(db, {
    checkpointId: state.mission.resumeCheckpointId,
    agentId: state.mission.agentId,
    workspaceId: state.mission.workspaceId,
    localRuntime: true
  });
  const checkpoint = resumable(row);
  if (checkpoint.promptHash !== hash(state.framedPrompt)) throw invalid('Checkpoint prompt changed.');
  return checkpoint;
}

async function save(state, phase, reply) {
  if (!state.mission.runtimeCheckpointEnabled) return null;
  if (reply != null && Buffer.byteLength(String(reply)) > MAX_REPLY_BYTES) {
    throw invalid('Local runtime reply exceeds checkpoint limit.');
  }
  const db = await require('../db').getDatabase();
  const payload = { workspaceId: state.mission.workspaceId, status: phase,
    currentTask: state.prompt, checkpoint: { kind: KIND, version: VERSION,
      phase, promptHash: hash(state.framedPrompt), reply: reply == null ? null : String(reply) } };
  return require('./resilienceService').persistIntermediateState(db,
    state.mission.agentId, payload, 'local-runtime-checkpoint');
}

module.exports = { captured, resumable, assertResumeRequest, load, save };
