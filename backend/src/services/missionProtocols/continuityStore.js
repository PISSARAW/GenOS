'use strict';

const { digest } = require('../evidenceProtocol/canonical');

const key = binding => digest([binding.scope, binding.missionId, binding.workspaceId, binding.agentId]);

async function ensure(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS mission_protocol_continuity (
    context_key TEXT PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL
  ); CREATE TABLE IF NOT EXISTS mission_protocol_continuity_checkpoints (
    checkpoint_id TEXT PRIMARY KEY, body TEXT NOT NULL, digest TEXT NOT NULL
  )`);
}

async function read(binding) {
  const row = await binding.db.get('SELECT body FROM mission_protocol_continuity WHERE context_key=?', key(binding));
  return row ? JSON.parse(row.body) : null;
}

async function write(binding, next, previous) {
  const body = JSON.stringify(next);
  if (!previous) {
    await binding.db.run('INSERT INTO mission_protocol_continuity VALUES (?,?,?)', key(binding), next.revision, body);
    return;
  }
  const result = await binding.db.run(`UPDATE mission_protocol_continuity SET revision=?,body=?
    WHERE context_key=? AND revision=? AND body=?`, next.revision, body, key(binding), previous.revision, JSON.stringify(previous));
  if (result.changes !== 1) throw new Error('MISSION_CONTINUITY_CAS_REJECTED');
}

async function nativeSnapshot(binding, runId) {
  const run = await binding.db.get('SELECT * FROM strategy_execution_runs WHERE id=?', runId);
  if (!run) throw new Error('MISSION_CONTINUITY_SOURCE_RUN_MISSING');
  const membership = await binding.db.get('SELECT * FROM mission_agents WHERE mission_id=? AND agent_id=?', binding.missionId, run.agent_id);
  if (!membership) throw new Error('MISSION_CONTINUITY_SOURCE_MISSION_MISMATCH');
  const mission = await binding.db.get('SELECT * FROM missions WHERE mission_id=?', binding.missionId);
  const steps = await binding.db.all('SELECT * FROM strategy_execution_steps WHERE run_id=? ORDER BY sequence', runId);
  return { mission, run, membership, steps };
}

async function checkpoint(binding, snapshot) {
  const checkpointId = digest({ scope: binding.scope, missionId: binding.missionId, snapshot });
  const body = JSON.stringify(snapshot);
  await binding.db.run('INSERT OR IGNORE INTO mission_protocol_continuity_checkpoints VALUES (?,?,?)', checkpointId, body, digest(snapshot));
  return { checkpointId, digest: digest(snapshot), sourceHistoryDigest: digest(snapshot) };
}

async function loadCheckpoint(binding, descriptor) {
  const row = await binding.db.get('SELECT body,digest FROM mission_protocol_continuity_checkpoints WHERE checkpoint_id=?', descriptor.checkpointId);
  if (!row || row.digest !== descriptor.digest) throw new Error('MISSION_CONTINUITY_CHECKPOINT_MISSING');
  const snapshot = JSON.parse(row.body);
  if (digest(snapshot) !== descriptor.digest) throw new Error('MISSION_CONTINUITY_CHECKPOINT_CORRUPT');
  return snapshot;
}

module.exports = { key, ensure, read, write, nativeSnapshot, checkpoint, loadCheckpoint };
