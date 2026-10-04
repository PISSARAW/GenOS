'use strict';

const conditions = require('./survivalWakeService');
const survival = require('./survivalStateService');

let timer = null;

async function tick(db, now = new Date()) {
  await reconcileAbandoned(db);
  const due = await conditions.listDue(db, now);
  const outcomes = [];
  for (const condition of due) {
    const result = await survival.wake(db, {
      agentId: condition.agentId, wakeConditionId: condition.id,
      event: { type: 'time_elapsed' }
    });
    outcomes.push({ conditionId: condition.id, result });
  }
  return outcomes;
}

async function reconcileAbandoned(db) {
  for (const condition of await conditions.abandoned(db)) {
    const state = await survival.get(db, condition.agentId);
    if (!state || !['dormant', 'waking'].includes(state.state)) continue;
    const runtime = await db.get('SELECT runtime_pid FROM agents WHERE id = ?', condition.agentId);
    if (pidAlive(runtime?.runtime_pid)) continue;
    const snapshot = await db.get('SELECT status FROM cryptobiosis_snapshots WHERE snapshot_id = ?', condition.snapshotId);
    if (snapshot?.status !== 'frozen') continue;
    if (state.state === 'waking') await survival.observe(db, condition.agentId, {
      forcedState: 'dormant', snapshotId: condition.snapshotId, wakeConditionId: condition.id
    });
    await conditions.rearm({ db, id: condition.id });
  }
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

function start(db, intervalMs = 5000) {
  if (timer) return timer;
  timer = setInterval(() => tick(db).catch(error => {
    console.error(`[GenOS Wake] Timed wake failed: ${error.message}`);
  }), intervalMs);
  timer.unref?.();
  tick(db).catch(error => console.error(`[GenOS Wake] Initial timed wake failed: ${error.message}`));
  return timer;
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { tick, start, stop, reconcileAbandoned };
