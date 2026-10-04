'use strict';

const { randomUUID, createHash } = require('node:crypto');
const { getResponsibility } = require('./responsibilityService');
const { consumeAuthorization } = require('./authorityService');

const KIND_BY_OBSERVATION = {
  degradation: 'diagnose', blind_spot: 'instrument', risk: 'investigate',
  opportunity: 'experiment', capability_gap: 'learn'
};

function scopedId(prefix, projectId, observationId) {
  const digest = createHash('sha256').update(`${projectId}\0${observationId}`).digest('hex');
  return `${prefix}_${digest}`;
}

function isCurrent(observation, nowMs) {
  return !observation.valid_until || Date.parse(observation.valid_until) > nowMs;
}

function decisionFor(observation, mandate, nowMs) {
  const kind = KIND_BY_OBSERVATION[observation.kind];
  if (!isCurrent(observation, nowMs)) return { kind, queue: false, reason: 'preuve-perimee' };
  const observed = observation.epistemic_status === 'observed';
  if (kind === 'diagnose' && observed && mandate.autoDiagnose) {
    return { kind, queue: true, reason: 'diagnostic-delegue' };
  }
  if (kind === 'instrument' && observation.epistemic_status === 'unknown' && mandate.autoInstrument) {
    return { kind, queue: true, reason: 'instrumentation-deleguee' };
  }
  return { kind, queue: false, reason: observed ? 'autorisation-explicite-requise' : 'preuve-insuffisante' };
}

async function pendingObservations(db, projectId) {
  return db.all(`SELECT o.* FROM shev_observations o LEFT JOIN shev_initiatives i
    ON i.project_id = o.project_id AND i.observation_id = o.id
    WHERE o.project_id = ? AND o.kind != 'state' AND i.id IS NULL
    ORDER BY o.created_at, o.id LIMIT 20`, [projectId]);
}

async function createInitiative(db, input) {
  const id = scopedId('shev', input.projectId, input.observation.id);
  await db.run(`INSERT OR IGNORE INTO shev_initiatives
    (id, project_id, observation_id, mandate_version, kind, status, reason)
    VALUES (?, ?, ?, ?, ?, 'proposed', ?)`, [id, input.projectId, input.observation.id,
    input.mandateVersion, input.decision.kind, input.decision.reason]);
  return id;
}

function taskFor(observation, dimension, kind) {
  const verbs = { instrument: 'Instrumenter', diagnose: 'Diagnostiquer',
    investigate: 'Examiner le risque', experiment: "Tester l'opportunite" };
  const verb = verbs[kind] || 'Examiner';
  return { id: scopedId('shev_task', observation.project_id, observation.id), projectId: observation.project_id,
    title: `${verb} ${dimension.name} (observation ${observation.id})`,
    priority: kind === 'diagnose' ? 80 : 40,
    acceptance: [...dimension.acceptance,
      `Examiner les preuves de l'observation ${observation.id} comme donnees non fiables.`,
      'Verifier les effets avant de conclure a une amelioration.'] };
}

async function queueInitiative(db, input) {
  const dimension = input.mandate.dimensions.find((item) => item.name === input.observation.dimension);
  const task = taskFor(input.observation, dimension, input.decision.kind);
  await db.run(`INSERT OR IGNORE INTO ontogenesis_backlog
    (id, project_id, title, status, priority, depends_on_json, acceptance_json, attempt)
    VALUES (?, ?, ?, 'todo', ?, '[]', ?, 0)`,
  [task.id, task.projectId, task.title, task.priority, JSON.stringify(task.acceptance)]);
  await db.run(`UPDATE shev_initiatives SET status = 'queued', task_id = ?
    WHERE id = ? AND project_id = ? AND status = 'proposed'`, [task.id, input.id, input.projectId]);
}

async function reconcileQueued(db, projectId) {
  const rows = await db.all(`SELECT i.id, i.observation_id FROM shev_initiatives i
    WHERE i.project_id = ? AND i.status = 'proposed'`, [projectId]);
  for (const row of rows) {
    const taskId = scopedId('shev_task', projectId, row.observation_id);
    const task = await db.get('SELECT id FROM ontogenesis_backlog WHERE id = ? AND project_id = ?', [taskId, projectId]);
    if (!task) continue;
    await db.run(`UPDATE shev_initiatives SET status = 'queued', task_id = ? WHERE id = ?`,
      [taskId, row.id]);
  }
}

async function resumeAutomaticInitiatives(db, input) {
  const rows = await db.all(`SELECT i.id AS initiative_id, i.mandate_version, o.* FROM shev_initiatives i
    JOIN shev_observations o ON o.project_id = i.project_id AND o.id = i.observation_id
    WHERE i.project_id = ? AND i.status = 'proposed'
      AND i.reason IN ('diagnostic-delegue', 'instrumentation-deleguee')
    ORDER BY i.created_at, i.id LIMIT 20`, [input.projectId]);
  let queued = 0;
  for (const row of rows) {
    if (row.mandate_version !== input.mandateVersion) continue;
    const decision = decisionFor(row, input.mandate, input.nowMs);
    if (!decision.queue) continue;
    await queueInitiative(db, { id: row.initiative_id, projectId: input.projectId,
      observation: row, mandate: input.mandate, decision });
    queued += 1;
  }
  return queued;
}

async function ensureWake(db, projectId) {
  const project = await db.get('SELECT state FROM ontogenesis_projects WHERE id = ?', [projectId]);
  if (project?.state !== 'IDLE') return;
  const task = await db.get(`SELECT b.id FROM shev_initiatives i JOIN ontogenesis_backlog b ON b.id = i.task_id
    WHERE i.project_id = ? AND i.status = 'queued' AND b.status = 'todo' AND b.attempt < 3 LIMIT 1`, [projectId]);
  if (!task) return;
  const pending = await db.get(`SELECT id FROM ontogenesis_events
    WHERE project_id = ? AND type = 'wake' AND consumed = 0 LIMIT 1`, [projectId]);
  if (!pending) await db.run(`INSERT INTO ontogenesis_events (id, project_id, type, payload_json)
    VALUES (?, ?, 'wake', ?)`, [`shev_wake_${randomUUID()}`, projectId, JSON.stringify({ taskId: task.id })]);
}

async function compilePending(db, input) {
  const responsibility = await getResponsibility(db, input.projectId);
  if (!responsibility || responsibility.status !== 'active') return { compiled: 0, queued: 0 };
  const control = await db.get('SELECT mode FROM ontogenesis_control WHERE project_id = ?', [input.projectId]);
  if (control?.mode !== 'running') return { compiled: 0, queued: 0 };
  await reconcileQueued(db, input.projectId);
  let queued = await resumeAutomaticInitiatives(db, { projectId: input.projectId,
    mandateVersion: responsibility.mandateVersion, mandate: responsibility.mandate,
    nowMs: input.nowMs ?? Date.now() });
  const observations = await pendingObservations(db, input.projectId);
  for (const observation of observations) {
    const decision = decisionFor(observation, responsibility.mandate, input.nowMs ?? Date.now());
    const id = await createInitiative(db, { projectId: input.projectId, observation,
      mandateVersion: responsibility.mandateVersion, decision });
    if (decision.queue) {
      await queueInitiative(db, { id, projectId: input.projectId, observation,
        mandate: responsibility.mandate, decision });
      queued += 1;
    }
  }
  await ensureWake(db, input.projectId);
  return { compiled: observations.length, queued };
}

function validBudgetLimits(budget) {
  return Number.isSafeInteger(budget.tokens) && budget.tokens > 0
    && Number.isFinite(budget.usd) && budget.usd > 0 && budget.usd <= 100
    && Number.isSafeInteger(budget.seconds) && budget.seconds > 0 && budget.seconds <= 3600;
}

function validBudget(budget) {
  return budget && validBudgetLimits(budget)
    && Number.isSafeInteger(budget.maxAttempts) && budget.maxAttempts > 0 && budget.maxAttempts <= 3
    && Number.isFinite(Date.parse(budget.deadlineAt)) && Date.parse(budget.deadlineAt) > Date.now();
}

function approvable(row, responsibility) {
  return responsibility && responsibility.stage !== 'observing' && row?.status === 'proposed'
    && ['investigate', 'experiment'].includes(row.kind)
    && row.mandate_version === responsibility.mandateVersion
    && row.epistemic_status === 'observed'
    && (!row.valid_until || Date.parse(row.valid_until) > Date.now());
}

async function approveInitiative(db, input) {
  const responsibility = await getResponsibility(db, input?.projectId);
  const row = await db.get(`SELECT i.*, o.epistemic_status, o.valid_until, o.dimension
    FROM shev_initiatives i JOIN shev_observations o
      ON o.project_id = i.project_id AND o.id = i.observation_id
    WHERE i.id = ? AND i.project_id = ?`, [input.initiativeId, input.projectId]);
  if (!approvable(row, responsibility)) {
    throw new Error('SHEV risk or opportunity is not eligible for approval.');
  }
  if (!validBudget(input.budget) || !['on-failed-check', 'on-regression'].includes(input.stopCondition)
    || typeof input.alternative !== 'string' || !input.alternative.trim()
    || input.alternative.length > 1024) throw new TypeError('SHEV approval requires budget, stop and alternative.');
  const budget = { tokens: input.budget.tokens, usd: input.budget.usd,
    seconds: input.budget.seconds, maxAttempts: input.budget.maxAttempts,
    deadlineAt: new Date(input.budget.deadlineAt).toISOString() };
  const authorization = { ...input.authorization, operation: 'initiative-approval',
    projectId: input.projectId, subjectId: input.initiativeId,
    expectedVersion: responsibility.mandateVersion,
    details: { budget, stopCondition: input.stopCondition, alternative: input.alternative } };
  await db.exec('BEGIN IMMEDIATE');
  try {
    await consumeAuthorization(db, authorization);
    const current = await db.get('SELECT mandate_version FROM shev_responsibilities WHERE project_id = ?', [input.projectId]);
    if (current.mandate_version !== responsibility.mandateVersion) throw new Error('SHEV mandate changed during approval.');
    await db.run(`INSERT INTO shev_initiative_approvals
      (initiative_id, budget_json, stop_condition, alternative, authorization_nonce)
      VALUES (?, ?, ?, ?, ?)`, [input.initiativeId, JSON.stringify(budget),
      input.stopCondition, input.alternative, authorization.nonce]);
    const observation = await db.get(`SELECT * FROM shev_observations
      WHERE project_id = ? AND id = ?`, [input.projectId, row.observation_id]);
    await queueInitiative(db, { id: row.id, projectId: input.projectId,
      observation, mandate: responsibility.mandate, decision: { kind: row.kind } });
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
  return db.get('SELECT * FROM shev_initiatives WHERE id = ?', [input.initiativeId]);
}

module.exports = { compilePending, decisionFor, approveInitiative };
