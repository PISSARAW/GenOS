'use strict';

const crypto = require('crypto');
const { recordScar, recordCheckpoint, isFunctionCovered } = require('./missionOrganismService');
const { emitCellDeath, emitTissueRegeneration } = require('./vitalSignalsService');
const attempts = require('./regenerationAttemptService');
const missionChecks = require('./missionRegenerationChecksService');

const DAMAGE_ASSESSMENT_SCHEMA = 'genos.damage-assessment/v1alpha1';

const LOSS_VERDICTS = Object.freeze({
  COVERED: 'covered',
  REGENERATE: 'regenerate',
  OBSOLETE: 'obsolete'
});

function damageAssessmentId() {
  return `dmg_${crypto.randomUUID()}`;
}

function lostCell(input = {}) {
  return {
    identifier: input.identifier || null,
    kind: input.kind || 'workers',
    role: input.role || null,
    reason: input.reason || 'unknown',
    lastEvidence: input.lastEvidence || null,
    at: input.at || new Date().toISOString()
  };
}

function survivingStructure(organism) {
  const survivors = {};
  for (const kind of Object.keys(organism.tissues || {})) {
    const tissue = organism.tissues[kind];
    if (Array.isArray(tissue)) {
      survivors[kind] = tissue.filter((cell) => cell.status === 'alive');
    }
  }
  return survivors;
}

function rolesCoveredBy(survivors) {
  const roles = new Set();
  for (const tissue of Object.values(survivors)) {
    for (const cell of tissue) {
      if (cell.role) roles.add(cell.role);
    }
  }
  return roles;
}

function verdictForLostRole(lostRole, coveredRoles) {
  if (!lostRole) return LOSS_VERDICTS.OBSOLETE;
  if (coveredRoles.has(lostRole)) return LOSS_VERDICTS.COVERED;
  return LOSS_VERDICTS.REGENERATE;
}

function assessDamage(input = {}) {
  const organism = input.organism;
  if (!organism) throw new Error('organism is required for damage assessment');
  const lostCells = (input.lostCells || []).map(lostCell);
  const survivors = survivingStructure(organism);
  const coveredRoles = rolesCoveredBy(survivors);
  const evaluations = lostCells.map((cell) => ({
    cell,
    verdict: verdictForLostRole(cell.role, coveredRoles)
  }));
  const regenerate = evaluations.filter((e) => e.verdict === LOSS_VERDICTS.REGENERATE);
  return {
    schema: DAMAGE_ASSESSMENT_SCHEMA,
    id: damageAssessmentId(),
    organismId: organism.id,
    lostCells: evaluations,
    survivors,
    coveredRoles: Array.from(coveredRoles),
    mustRegenerate: regenerate.map((e) => e.cell),
    organismViable: evaluations.every((e) => e.verdict !== LOSS_VERDICTS.REGENERATE) || regenerate.length < lostCells.length,
    assessedAt: new Date().toISOString()
  };
}

function regenerationPlanFromAssessment(assessment) {
  return assessment.mustRegenerate.map((cell) => ({
    lostIdentifier: cell.identifier,
    kind: cell.kind,
    role: cell.role,
    method: 'regenerate_minimum_necessary',
    status: 'requested',
    requiresFunctionalEquivalence: true
  }));
}

function markCellStatus(organism, identifier, status) {
  const updated = { ...organism, tissues: {} };
  for (const kind of Object.keys(organism.tissues)) {
    updated.tissues[kind] = organism.tissues[kind].map((cell) => (
      cell.identifier === identifier ? { ...cell, status } : cell
    ));
  }
  return updated;
}

function applyCellDeath(input = {}) {
  const { organism, cell, reason } = input;
  if (!organism || !cell) throw new Error('organism and cell are required');
  const updated = markCellStatus(organism, cell.identifier, 'dead');
  const assessment = assessDamage({ organism: updated, lostCells: [cell] });
  const scarred = recordScar(updated, {
    injury: `cell_death:${cell.identifier}`,
    repair: null,
    stateBefore: cell.role,
    stateAfter: null,
    successful: null
  });
  const event = emitCellDeath({
    cell: cell.identifier,
    mission: input.mission || null,
    role: cell.role,
    reason: reason || 'unknown',
    organismId: organism.id
  });
  return { organism: scarred, assessment, event };
}

function regenerateCell(input = {}) {
  const { organism, plan } = input;
  if (!organism || !plan) throw new Error('organism and plan are required');
  const replacementId = plan.replacementId || `cell_${crypto.randomUUID()}`;
  const updated = { ...organism, tissues: { ...organism.tissues } };
  updated.tissues[plan.kind] = [
    ...(updated.tissues[plan.kind] || []),
    { kind: plan.kind, identifier: replacementId, role: plan.role, status: 'alive', since: new Date().toISOString() }
  ];
  const scarred = recordScar(updated, {
    injury: `cell_loss:${plan.lostIdentifier}`,
    repair: `regenerate:${replacementId}`,
    stateBefore: plan.role,
    stateAfter: plan.role,
    successful: true,
    evidenceRef: input.evidenceRef
  });
  const event = emitTissueRegeneration({
    tissue: plan.kind,
    mission: input.mission || null,
    lostRole: plan.role,
    replacementId,
    method: plan.method || 'regeneration'
  });
  return { organism: scarred, replacementId, event };
}

async function regenerateWorker(input = {}) {
  const { db, missionId, plan } = input;
  if (!db || !missionId || !plan?.role || !plan.lostIdentifier) throw new Error('db, missionId and a lost worker role are required.');
  const tokens = Number(input.executionBudget?.tokens);
  if (!Number.isSafeInteger(tokens) || tokens <= 0) return blockedBudget();
  const context = await loadRegenerationContext(input);
  if (!context.checks?.commands.length || !context.parent.workspace_root) {
    return { success: false, status: 'blocked', reason: 'Mission-configured regeneration checks and a workspace are required.' };
  }
  const proposedId = `worker_${crypto.randomUUID()}`;
  const reservation = await attempts.reserve(db, { missionId, lostIdentifier: plan.lostIdentifier, role: plan.role, replacementId: proposedId });
  if (!reservation.reserved) return { success: false, status: 'blocked', reason: reservation.reason };
  return runReservedRegeneration({ input, context, replacementId: reservation.replacementId });
}

function blockedBudget() {
  return { success: false, status: 'blocked', reason: 'A bounded positive regeneration token budget is required.' };
}

async function runReservedRegeneration(state) {
  const { input, context, replacementId } = state;
  const { db, missionId, plan } = input;
  const prompt = `${input.prompt || `Replace the lost ${plan.role} worker for mission: ${input.objective || context.mission.objective}.`} In the EVIDENCE_REPORT, provide functionalEquivalence with lostIdentifier='${plan.lostIdentifier}', role='${plan.role}', passed=true, and checks for these mission-configured commands: ${context.checks.commands.join('; ')}. Include command, exitCode and evidenceRef for each check. GenOS replays these checks independently.`;
  try {
    await insertRegenerationWorker(db, { replacementId, orchestratorId: context.orchestratorId, parent: context.parent, role: plan.role, prompt });
    await require('./missionIdentityService').attachAgent(db, { missionId, agentId: replacementId, role: plan.role });
    const priorReceipt = await readRegenerationReceipt(db, replacementId);
    const result = priorReceipt
      ? await verifyRegeneratedWorker({ input, context, replacementId })
      : await dispatchRegeneratedWorker({ input, context, replacementId, prompt })
        || await verifyRegeneratedWorker({ input, context, replacementId });
    await attempts.mark(db, { missionId, lostIdentifier: plan.lostIdentifier, replacementId,
      status: result.success ? 'verified' : result.status, evidenceRef: result.evidenceRef });
    return result;
  } catch (error) {
    await attempts.mark(db, { missionId, lostIdentifier: plan.lostIdentifier, replacementId, status: 'error' });
    throw error;
  }
}

async function loadRegenerationContext(input) {
  const { db, missionId } = input;
  const mission = await require('./missionIdentityService').get(db, missionId);
  const orchestratorId = input.orchestratorAgentId || mission?.orchestratorAgentId;
  if (!mission || mission.status !== 'active' || !orchestratorId) {
    throw Object.assign(new Error('An active mission with a current orchestrator is required for worker regeneration.'), { code: 'MISSION_NOT_ACTIVE' });
  }
  const parent = await db.get(`SELECT a.workspace_id, a.fleet_id, a.model_tier, a.language, a.isolation_mode,
    w.path AS workspace_root FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ?`, orchestratorId);
  if (!parent) throw Object.assign(new Error('Current mission orchestrator was not found.'), { code: 'ORCHESTRATOR_NOT_FOUND' });
  const checks = await missionChecks.get(db, missionId, input.plan.role);
  return { mission, orchestratorId, parent, checks };
}

async function dispatchRegeneratedWorker(input) {
  const { input: request, context, replacementId, prompt } = input;
  const { db, plan } = request;
  const { orchestratorId, parent } = context;
  try {
    await require('./workerGarageService').reserveSlot(db, {
      orchestratorId, workerId: replacementId, name: `Regenerated ${plan.role}`, role: plan.role, mission: prompt
    });
    await require('./orchestratorDispatchService').dispatchWorkerMission({
      agentId: replacementId,
      missionId: request.missionId,
      orchestratorAgentId: orchestratorId,
      prompt,
      role: plan.role,
      workspaceId: parent.workspace_id,
      workspaceRoot: parent.workspace_root,
      fleetId: parent.fleet_id,
      modelTier: parent.model_tier,
      language: parent.language,
      workspaceIsolation: parent.isolation_mode,
      executionBudget: request.executionBudget || {},
      executionPolicy: request.executionPolicy || {},
      toolLease: request.toolLease,
      timeoutMs: request.timeoutMs,
      strategyContract: request.strategyContract
    });
  } catch (error) {
    await db.run("UPDATE agents SET status = 'error', current_task = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", error.message, replacementId);
    return { success: false, replacementId, status: 'error', error: error.message };
  }
  return null;
}

async function verifyRegeneratedWorker(input) {
  const { input: request, context, replacementId } = input;
  const { db, missionId, plan } = request;
  const receipt = await readRegenerationReceipt(db, replacementId);
  if (!receipt) {
    await db.run("UPDATE agents SET status = 'unverified', current_task = 'Missing successful evidence report for regeneration', updated_at = CURRENT_TIMESTAMP WHERE id = ?", replacementId);
    return { success: false, replacementId, status: 'unverified', reason: 'Worker did not persist a successful evidence report.' };
  }
  if (!hasFunctionalProof(receipt.report, plan, context.checks.commands)) {
    await db.run("UPDATE agents SET status = 'unverified', current_task = 'Missing functional equivalence proof', updated_at = CURRENT_TIMESTAMP WHERE id = ?", replacementId);
    return { success: false, replacementId, status: 'unverified', reason: 'Functional equivalence proof is missing or invalid.' };
  }
  let agent = await db.get('SELECT status FROM agents WHERE id = ?', replacementId);
  if (!agent || !['completed', 'idle'].includes(agent.status)) {
    return { success: false, replacementId, status: agent?.status || 'missing', reason: 'Worker dispatch has no successful terminal result.' };
  }
  const independent = await missionChecks.verify(db, {
    missionId, lostAgentId: plan.lostIdentifier, replacementId, role: plan.role,
    workspaceRoot: context.parent.workspace_root, reportEvidenceRef: receipt.evidenceRef
  });
  if (!independent.success) {
    await db.run("UPDATE agents SET status = 'unverified', current_task = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      independent.reason, replacementId);
    return { success: false, replacementId, status: 'unverified', reason: independent.reason,
      evidenceRef: independent.evidenceRef };
  }
  if (agent?.status === 'completed') {
    await require('./workerGarageService').enterIdleState(db, replacementId, context.orchestratorId);
    agent = await db.get('SELECT status FROM agents WHERE id = ?', replacementId);
  }
  const regenerated = regenerateCell({ organism: request.organism, plan: { ...plan, replacementId }, mission: missionId, evidenceRef: independent.evidenceRef });
  const equivalence = verifyFunctionalEquivalence(regenerated.organism, request.requiredRoles || [plan.role]);
  return { success: equivalence.equivalent, replacementId, status: agent.status, evidenceRef: independent.evidenceRef, ...regenerated, equivalence };
}

function hasFunctionalProof(report, plan, commands) {
  const proof = report.functionalEquivalence;
  return proof?.lostIdentifier === plan.lostIdentifier && proof.role === plan.role
    && proof.passed === true && Array.isArray(proof.checks) && proof.checks.length > 0
    && commands.every(command => proof.checks.some(check => check.command === command && check.exitCode === 0))
    && proof.checks.every(validReportedCheck);
}

function validReportedCheck(check) {
  return typeof check.command === 'string' && Boolean(check.command.trim())
    && check.exitCode === 0 && typeof check.evidenceRef === 'string' && Boolean(check.evidenceRef.trim());
}

async function readRegenerationReceipt(db, agentId) {
  const rows = await db.all(`SELECT id, payload_json FROM telemetry_events
    WHERE agent_id = ? AND event_type = 'EVIDENCE_REPORT' ORDER BY id DESC LIMIT 5`, agentId);
  const evidence = require('./agentEvidenceService');
  for (const row of rows) {
    let payload;
    try { payload = JSON.parse(row.payload_json || '{}'); } catch (_) { continue; }
    const report = evidence.extractEvidenceReport(payload);
    if (report.outcome !== 'success' || !evidence.hasDecisionEvidence({ eventType: 'EVIDENCE_REPORT', payload })) continue;
    const evidenceRef = `sha256:${crypto.createHash('sha256').update(`${row.id}:${row.payload_json}`).digest('hex')}`;
    return { evidenceRef, report };
  }
  return null;
}

async function insertRegenerationWorker(db, input) {
  const { replacementId, orchestratorId, parent, role, prompt } = input;
  await db.run(`INSERT OR IGNORE INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id,
    fleet_id, model_tier, language, isolation_mode, parent_agent_id, current_task)
    VALUES (?, ?, ?, 'idle', 'GenOS', 'worker', ?, ?, ?, ?, ?, ?, ?)`,
  replacementId, `Regenerated ${role}`, role, parent.workspace_id, parent.fleet_id,
  parent.model_tier || 'standard', parent.language || 'TypeScript', parent.isolation_mode || 'Branch', orchestratorId, prompt);
  await db.run(`UPDATE agents SET status = 'idle', current_task = ?
    WHERE id = ? AND status IN ('error', 'unverified', 'completed')`, prompt, replacementId);
}

function verifyFunctionalEquivalence(organism, requiredRoles) {
  const covered = isFunctionCovered(organism, requiredRoles || []);
  return {
    equivalent: covered,
    requiredRoles: requiredRoles || [],
    checkedAt: new Date().toISOString()
  };
}

function checkpointBeforeRiskyAction(input = {}) {
  const { organism, reason } = input;
  if (!organism) throw new Error('organism is required');
  const updated = recordCheckpoint(organism, {
    state: organism.phenotype ? organism.phenotype.currentState : null,
    injury: null,
    repair: null,
    outcome: reason || 'pre_action_checkpoint',
    successful: null
  });
  return { organism: updated, reason: reason || 'pre_action_checkpoint' };
}

module.exports = {
  DAMAGE_ASSESSMENT_SCHEMA,
  LOSS_VERDICTS,
  assessDamage,
  regenerationPlanFromAssessment,
  applyCellDeath,
  regenerateCell,
  regenerateWorker,
  verifyFunctionalEquivalence,
  checkpointBeforeRiskyAction,
  survivingStructure,
  rolesCoveredBy
};
