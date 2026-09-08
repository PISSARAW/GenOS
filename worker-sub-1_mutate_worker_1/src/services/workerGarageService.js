const MAX_ACTIVE_WORKERS = 3;

function projectCapacity() {
  const configured = Number(process.env.GENOS_MAX_ACTIVE_WORKERS_PER_PROJECT);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 12;
}

const MISSION_STOP_WORDS = new Set([
  'agent', 'worker', 'scope', 'mission', 'task', 'work', 'assigned', 'delegated',
  'the', 'and', 'for', 'from', 'with', 'into', 'this', 'that', 'une', 'des',
  'les', 'dans', 'pour', 'avec', 'sur', 'par', 'qui', 'que', 'est', 'faire',
  'implementation', 'implement', 'review', 'verify', 'audit', 'investigate'
]);

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
  if (/literary author|writer|stylist/.test(normalized)) return 'Write';
  if (/dramaturg/.test(normalized)) return 'Structure';
  if (/literary critic/.test(normalized)) return 'Critique';
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

function missionTokens(value) {
  return humanize(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.length > 4 && token.endsWith('ies')
      ? `${token.slice(0, -3)}y`
      : token.length > 4 && token.endsWith('s') && !token.endsWith('ss') && !token.endsWith('us') && !token.endsWith('is') && !['always', 'analysis', 'status', 'process'].includes(token) ? token.slice(0, -1) : token)
    .filter((token) => token.length >= 3 && !MISSION_STOP_WORDS.has(token));
}

function roleFamily(role) {
  const normalized = humanize(role).toLowerCase();
  if (/literary author|writer|stylist/.test(normalized)) return 'literary_creation';
  if (/dramaturg/.test(normalized)) return 'dramaturgy';
  if (/literary critic/.test(normalized)) return 'literary_criticism';
  if (/red team|attack|offensive/.test(normalized)) return 'security_attack';
  if (/blue team|defen|hardening/.test(normalized)) return 'security_defense';
  if (/review|observer|verif|audit|test|qa/.test(normalized)) return 'verification';
  if (/implement|coder|developer|engineer/.test(normalized)) return 'implementation';
  if (/research|investig|analys|diagnos/.test(normalized)) return 'investigation';
  return 'generic';
}

function missionAffinity(mission, scope) {
  const missionSet = new Set(missionTokens(mission));
  const scopeSet = new Set(missionTokens(scope));
  const shared = [...missionSet].filter((token) => scopeSet.has(token));
  if (!missionSet.size || !scopeSet.size) return { matches: false, score: 0, shared };
  const missionCoverage = shared.length / missionSet.size;
  const scopeCoverage = shared.length / scopeSet.size;
  const singleSpecificMatch = shared.length === 1
    && Math.min(missionSet.size, scopeSet.size) === 1
    && shared[0].length >= 5;
  const matches = shared.length >= 2 && (missionCoverage >= 0.4 || scopeCoverage >= 0.4) || singleSpecificMatch;
  return {
    matches,
    score: matches ? shared.length * 10 + missionCoverage * 3 + scopeCoverage : 0,
    shared
  };
}

function reuseAffinity(worker, { mission, role } = {}) {
  if (!worker) return null;
  const requestedFamily = roleFamily(role);
  const workerFamily = roleFamily(worker.role);
  if (requestedFamily !== 'generic' && workerFamily !== requestedFamily) return null;
  const affinity = missionAffinity(mission, `${worker.about || ''} ${worker.name || ''}`);
  return affinity.matches ? affinity : null;
}

async function findReusableWorker(db, orchestratorId, { mission, role } = {}) {
  const workers = await db.all(
    `SELECT id, name, role, about, current_task as currentTask, model_tier as modelTier,
            language, isolation_mode as isolationMode, created_at as createdAt
     FROM agents
     WHERE parent_agent_id = ? AND execution_mode = 'worker' AND status = 'idle'
       AND workspace_id = (SELECT workspace_id FROM agents WHERE id = ?)
     ORDER BY updated_at DESC, created_at DESC, id`,
    orchestratorId, orchestratorId
  );
  return workers
    .map((worker) => {
      const affinity = reuseAffinity(worker, { mission, role });
      return affinity ? { ...worker, affinity } : null;
    })
    .filter(Boolean)
    .sort((left, right) => right.affinity.score - left.affinity.score)[0] || null;
}

async function state(db, orchestratorId) {
  const dbWorkers = await db.all(
    `SELECT id, name, role, current_task as currentTask, status, created_at as createdAt
     FROM agents
     WHERE parent_agent_id = ? AND execution_mode = 'worker'
       AND (status = 'running' OR (status = 'blocked' AND current_task = 'Stopping on operator request'))
     ORDER BY created_at, id`,
    orchestratorId
  );
  const activeWorkers = dbWorkers;

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
  const project = await db.get('SELECT w.organization_id, w.project_id FROM agents a JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ?', orchestratorId);
  if (project?.project_id) {
    const activeProject = await db.get(`SELECT COUNT(*) AS count
      FROM agents a JOIN workspaces w ON w.id = a.workspace_id
      WHERE a.execution_mode = 'worker' AND a.status IN ('running', 'blocked')
        AND w.organization_id = ? AND w.project_id = ?`, project.organization_id, project.project_id);
    if (!alreadyActive && Number(activeProject?.count || 0) >= projectCapacity()) {
      const error = new Error(`Project '${project.project_id}' already has ${projectCapacity()} active workers.`);
      error.code = 'PROJECT_WORKER_CAPACITY_FULL';
      error.garage = { ...garage, projectCapacity: projectCapacity(), projectOccupied: Number(activeProject?.count || 0), available: 0 };
      throw error;
    }
  }
  return { ...garage, slot: alreadyActive ? garage.activeWorkers.find((worker) => worker.id === workerId).slot : garage.occupied + 1 };
}

async function reserveSlot(db, { orchestratorId, workerId, name, role, mission }) {
  const worker = await db.get('SELECT status FROM agents WHERE id = ?', workerId);
  if (!worker) {
    const error = new Error(`Worker '${workerId}' was not found.`);
    error.code = 'AGENT_NOT_FOUND';
    throw error;
  }
  if (worker.status === 'running') {
    const error = new Error(`Worker '${workerId}' is already running.`);
    error.code = 'WORKER_ALREADY_RUNNING';
    throw error;
  }
  if (worker.status !== 'idle') {
    const error = new Error(`Worker '${workerId}' is ${worker.status} and cannot be dispatched until it returns to idle.`);
    error.code = 'WORKER_NOT_IDLE';
    throw error;
  }
  await requireAvailableSlot(db, orchestratorId, workerId);
  const reservation = await db.run(
    `UPDATE agents SET name = ?, role = ?, current_task = ?, status = 'running', updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND parent_agent_id = ? AND execution_mode = 'worker' AND status = 'idle' AND (
       SELECT COUNT(*) FROM agents active
       WHERE active.parent_agent_id = ? AND active.execution_mode = 'worker'
         AND (active.status = 'running' OR (active.status = 'blocked' AND active.current_task = 'Stopping on operator request'))
    ) < ?`,
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
    reserved: true
  };
}

module.exports = {
  MAX_ACTIVE_WORKERS,
  projectCapacity,
  workerName,
  missionTokens,
  missionAffinity,
  reuseAffinity,
  findReusableWorker,
  state,
  requireAvailableSlot,
  reserveSlot
};
