const MAX_ACTIVE_WORKERS = 3;

function humanize(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactMission(value, maxLength = 72) {
  const mission = humanize(value) || 'assigned mission';
  return mission.length <= maxLength ? mission : `${mission.slice(0, maxLength - 1).trimEnd()}…`;
}

function roleVerb(role) {
  const normalized = humanize(role).toLowerCase();
  if (/red team/.test(normalized)) return 'Attack';
  if (/blue team/.test(normalized)) return 'Defend';
  if (/review|observer|verif|audit/.test(normalized)) return 'Verify';
  if (/implement|coder|developer/.test(normalized)) return 'Implement';
  if (/research|investig/.test(normalized)) return 'Investigate';
  return humanize(role) || 'Work';
}

function workerName({ role, hypothesis, mission, label } = {}) {
  const verb = roleVerb(role);
  let subject = compactMission(hypothesis || mission || label);
  if (subject.toLowerCase().startsWith(`${verb.toLowerCase()} `)) subject = subject.slice(verb.length).trim();
  return `${verb} · ${subject}`;
}

async function state(db, orchestratorId) {
  const activeWorkers = await db.all(
    `SELECT id, name, role, current_task as currentTask, status, created_at as createdAt
     FROM agents
     WHERE parent_agent_id = ? AND execution_mode = 'worker'
       AND (status = 'running' OR (status = 'blocked' AND current_task = 'Stopping on operator request'))
     ORDER BY created_at, id`,
    orchestratorId
  );
  return {
    capacity: MAX_ACTIVE_WORKERS,
    occupied: activeWorkers.length,
    available: Math.max(0, MAX_ACTIVE_WORKERS - activeWorkers.length),
    activeWorkers: activeWorkers.map((worker, index) => ({ ...worker, slot: index + 1 }))
  };
}

async function requireAvailableSlot(db, orchestratorId, workerId = null) {
  const garage = await state(db, orchestratorId);
  const alreadyActive = workerId && garage.activeWorkers.some((worker) => worker.id === workerId);
  if (!alreadyActive && garage.available === 0) {
    const error = new Error(`Orchestrator '${orchestratorId}' already has ${MAX_ACTIVE_WORKERS} active workers. Complete or stop one worker before dispatching another.`);
    error.code = 'WORKER_GARAGE_FULL';
    error.garage = garage;
    throw error;
  }
  return { ...garage, slot: alreadyActive ? garage.activeWorkers.find((worker) => worker.id === workerId).slot : garage.occupied + 1 };
}

async function reserveSlot(db, { orchestratorId, workerId, name, role, mission }) {
  const worker = await db.get('SELECT status FROM agents WHERE id = ?', workerId);
  if (worker?.status === 'blocked') {
    const error = new Error(`Worker '${workerId}' is stopping or blocked and cannot be dispatched until its runtime has exited.`);
    error.code = 'WORKER_NOT_IDLE';
    throw error;
  }
  const wasAlreadyActive = worker?.status === 'running';
  await requireAvailableSlot(db, orchestratorId, workerId);
  const reservation = await db.run(
    `UPDATE agents SET name = ?, role = ?, current_task = ?, status = 'running', updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND parent_agent_id = ? AND execution_mode = 'worker' AND (status = 'running' OR (
       SELECT COUNT(*) FROM agents active
       WHERE active.parent_agent_id = ? AND active.execution_mode = 'worker'
         AND (active.status = 'running' OR (active.status = 'blocked' AND active.current_task = 'Stopping on operator request'))
     ) < ?)`,
    name, role, mission, workerId, orchestratorId, orchestratorId, MAX_ACTIVE_WORKERS
  );
  if (!reservation.changes) {
    const error = new Error(`All ${MAX_ACTIVE_WORKERS} worker slots are occupied.`);
    error.code = 'WORKER_GARAGE_FULL';
    error.garage = await state(db, orchestratorId);
    throw error;
  }
  const garage = await state(db, orchestratorId);
  return {
    ...garage,
    slot: garage.activeWorkers.find((active) => active.id === workerId)?.slot,
    reserved: !wasAlreadyActive
  };
}

module.exports = { MAX_ACTIVE_WORKERS, workerName, state, requireAvailableSlot, reserveSlot };
