'use strict';

const conditions = require('./survivalWakeService');
const survival = require('./survivalStateService');
const registry = require('./missionResourceRegistryService');
const { reconcileAbandoned } = require('./survivalWakeRecoveryService');

let timer = null;

async function tick(db, now = new Date()) {
  await reconcileAbandoned(db);
  const due = await conditions.listDue(db, now);
  for (const condition of await conditions.listRegistryArmed(db)) {
    if (await registry.satisfies(db, condition)) due.push(condition);
  }
  const outcomes = [];
  for (const condition of due) {
    const result = await survival.wake(db, {
      agentId: condition.agentId, wakeConditionId: condition.id,
      event: { type: condition.condition.type }
    });
    outcomes.push({ conditionId: condition.id, result });
  }
  return outcomes;
}

function start(db, intervalMs = 5000) {
  if (timer) return timer;
  timer = setInterval(() => tick(db).catch(error => {
    console.error(`[GenOS Wake] Automatic wake failed: ${error.message}`);
  }), intervalMs);
  timer.unref?.();
  tick(db).catch(error => console.error(`[GenOS Wake] Initial automatic wake failed: ${error.message}`));
  return timer;
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { tick, start, stop, reconcileAbandoned };
