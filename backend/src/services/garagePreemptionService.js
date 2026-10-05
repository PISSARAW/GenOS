'use strict';

const runtime = require('./agentRuntimeAdapter');
const genosCli = require('./genosCli');
const resilience = require('./resilienceService');

function freezeAdapter(input = {}) {
  return input.freeze || (async (context) => {
    const state = { agentId: context.agentId, workspaceId: context.workspaceId, reason: context.reason };
    const stopped = await runtime.stopMission(context.agentId);
    const result = await genosCli.runCryptobiosisFreeze(context.agentId, { state });
    return { ...result, runtimeStopped: stopped };
  });
}

function thawAdapter(input = {}) {
  return input.thaw || (async (context) => {
    const response = await genosCli.runCryptobiosisThaw(context.agentId);
    const data = response.data || {};
    if (!response.ok || (data.agent_id && data.agent_id !== context.agentId) || data.status !== 'RESUSCITATED') {
      return { success: false, code: 'GARAGE_THAW_INVALID', error: response.error || 'Cryptobiosis thaw returned an invalid capsule.' };
    }
    return resilience.thawCryptobiosis(context.db, context.snapshotId, context.workspaceId);
  });
}

async function loadWorker(db, workerId) {
  return db.get('SELECT id, workspace_id, status, current_task, metadata_json FROM agents WHERE id = ? AND execution_mode = \'worker\'', workerId);
}

async function recordGarageState(db, worker, patch) {
  let metadata = {};
  try { metadata = JSON.parse(worker.metadata_json || '{}'); } catch (_) { metadata = {}; }
  const next = JSON.stringify({ ...metadata, garage: { ...(metadata.garage || {}), ...patch } });
  const currentTask = Object.prototype.hasOwnProperty.call(patch, 'currentTask') ? patch.currentTask : worker.current_task;
  await db.run('UPDATE agents SET metadata_json = ?, status = ?, current_task = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', next, patch.status || worker.status, currentTask, worker.id);
}

async function freezeWorker(input = {}) {
  const worker = await loadWorker(input.db, input.workerId);
  if (!worker) throw Object.assign(new Error('Worker not found for garage preemption.'), { code: 'AGENT_NOT_FOUND' });
  const result = await freezeAdapter(input)({ agentId: worker.id, workspaceId: worker.workspace_id, reason: input.reason || 'Garage preemption' });
  const data = result.data || result.cryptobiosis || result;
  const capsuleHash = data.capsule_hash || data.capsuleHash;
  if ((!result.ok && result.success !== true) || typeof capsuleHash !== 'string' || !capsuleHash) {
    throw Object.assign(new Error('Worker freeze did not produce a durable capsule.'), { code: 'GARAGE_FREEZE_FAILED' });
  }
  const snapshotId = data.capsule_id || data.snapshotId || `${worker.id}:${data.capsule_hash || data.capsuleHash}`;
  await input.db.run(
    `INSERT OR IGNORE INTO cryptobiosis_snapshots(snapshot_id, id, agent_id, workspace_id, capsule_hash, status, metadata_json)
     VALUES (?, ?, ?, ?, ?, 'frozen', ?)`,
    snapshotId, snapshotId, worker.id, worker.workspace_id || null, capsuleHash,
    JSON.stringify({ source: 'garage_fabric', reason: input.reason || 'Garage preemption' })
  );
  await recordGarageState(input.db, worker, { status: 'blocked', currentTask: `[GARAGE] Frozen ${snapshotId}`, snapshotId, frozenAt: new Date().toISOString() });
  return { workerId: worker.id, snapshotId, status: 'frozen', runtimeStopped: Boolean(result.runtimeStopped) };
}

async function thawWorker(input = {}) {
  const worker = await loadWorker(input.db, input.workerId);
  if (!worker) throw Object.assign(new Error('Worker not found for garage thaw.'), { code: 'AGENT_NOT_FOUND' });
  const result = await thawAdapter(input)({ db: input.db, agentId: worker.id, workspaceId: worker.workspace_id, snapshotId: input.snapshotId });
  if (result && result.success === false) throw Object.assign(new Error(result.error || 'Worker thaw failed.'), { code: result.code || 'GARAGE_THAW_FAILED' });
  await input.db.run("UPDATE cryptobiosis_snapshots SET status = 'thawed', thawed_at = CURRENT_TIMESTAMP WHERE snapshot_id = ?", input.snapshotId);
  await recordGarageState(input.db, worker, { status: 'idle', currentTask: null, thawedAt: new Date().toISOString(), snapshotId: input.snapshotId });
  if (input.restartMission) await input.restartMission({ agentId: worker.id, workspaceId: worker.workspace_id, prompt: input.prompt || worker.current_task });
  return { workerId: worker.id, snapshotId: input.snapshotId, status: 'thawed' };
}

module.exports = { freezeWorker, thawWorker };
