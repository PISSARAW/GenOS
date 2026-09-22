'use strict';

/**
 * Mission Continuity Service — câble les six systèmes de continuité à une
 * mission réelle : assemble l'organisme depuis les agents en base, évalue
 * l'homéostasie, émet les pulses vitaux et décide des modes de survie.
 */

const { newOrganism, recordScar, recordCheckpoint, isFunctionCovered } = require('./missionOrganismService');
const { buildMissionHomeostasis, attachHomeostasisToOrganism, evaluateMissionHomeostasis } = require('./homeostasisService');
const vitalSignals = require('./vitalSignalsService');
const immuneGate = require('./immuneGateService');
const immuneMemory = require('./immuneMemoryService');
const regeneration = require('./regenerationService');
const survivalModes = require('./survivalModesService');

const TISSUE_KINDS = Object.freeze({
  orchestrator: 'orchestrator',
  worker: 'workers',
  verifier: 'verifiers',
  recovery: 'recoveryCells'
});

const AGENT_STATUS_TO_CELL = Object.freeze({
  running: 'alive',
  idle: 'alive',
  completed: 'dead',
  blocked: 'quiescent',
  error: 'dead',
  terminated: 'dead',
  apoptosis: 'dead',
  quarantined: 'injured',
  unverified: 'dead',
  failed: 'dead'
});

const TERMINAL_STATUSES = new Set(['completed', 'error', 'terminated', 'apoptosis', 'unverified', 'failed']);

function tissueKindForAgent(agent) {
  if (agent.execution_mode === 'worker') {
    return String(agent.role || '').toLowerCase().includes('verif')
      ? TISSUE_KINDS.verifier
      : TISSUE_KINDS.worker;
  }
  return TISSUE_KINDS.orchestrator;
}

function agentToCell(agent) {
  return {
    kind: tissueKindForAgent(agent),
    identifier: agent.id,
    role: agent.role || null,
    status: AGENT_STATUS_TO_CELL[agent.status] || 'alive'
  };
}

async function fetchMissionAgents(db, missionId) {
  return db.all(
    'SELECT id, role, status, execution_mode FROM agents WHERE id = ? OR parent_agent_id = ?',
    missionId, missionId
  );
}

async function assembleOrganism(db, mission) {
  const agents = await fetchMissionAgents(db, mission.id);
  const cells = agents.map(agentToCell);
  const organismId = `organism_${mission.id}`;

  // Try to restore existing organism state from DB
  const existingState = await restoreOrganismState(db, organismId);
  let organism;

  if (existingState && existingState.memory) {
    // Restore organism from persisted state
    const genome = {
      objective: mission.objective || mission.task || null,
      invariants: mission.invariants || existingState.genome?.invariants || [],
      completionContract: mission.completionContract || existingState.genome?.completionContract || null,
      safetyConstraints: mission.safetyConstraints || existingState.genome?.safetyConstraints || []
    };
    const phenotype = existingState.phenotype
      ? { currentPlan: existingState.phenotype.currentPlan, activeExecution: existingState.phenotype.activeExecution, currentState: existingState.phenotype.currentState }
      : buildPhenotype({});

    organism = {
      id: organismId,
      genome,
      phenotype,
      tissues: existingState.tissues || cells,
      metabolism: existingState.metabolism || { tokens: 0, cost: 0, latencyMs: 0, computeCycles: 0, sampledAt: new Date().toISOString() },
      immuneSystem: existingState.immuneSystem || buildImmuneSystem({ evidenceGates: [], tests: [], anomalyDetection: null, quarantine: null }),
      nervousSystem: existingState.nervousSystem || buildNervousSystem({ heartbeats: [], signals: [] }),
      memory: existingState.memory,
      survival: existingState.survival || buildSurvivalSystem({ regeneration: null, quiescence: null, cryptobiosis: null, apoptosis: null }),
      assembledAt: new Date().toISOString()
    };
  } else {
    // Create new organism
    const genome = {
      objective: mission.objective || mission.task || null,
      invariants: mission.invariants || [],
      completionContract: mission.completionContract || null,
      safetyConstraints: mission.safetyConstraints || []
    };
    organism = newOrganism({ id: organismId, genome, tissues: cells });
    // Persist the new organism state for future restorations
    await persistOrganismState(db, organism);
  }

  return organism;
}

function buildPhenotype(input = {}) {
  return {
    id: `phenotype_${crypto.randomUUID()}`,
    currentPlan: input.currentPlan || null,
    activeExecution: input.activeExecution || null,
    currentState: input.currentState || null,
    expressedAt: new Date().toISOString()
  };
}

async function persistOrganismState(db, organism) {
  const memory = organism.memory || buildMemorySystem({ checkpoints: [], scars: [], failedStrategies: [], provenance: [] });
  const survival = organism.survival || buildSurvivalSystem({ regeneration: null, quiescence: null, cryptobiosis: null, apoptosis: null });
  const immuneSystem = organism.immuneSystem || buildImmuneSystem({ evidenceGates: [], tests: [], anomalyDetection: null, quarantine: null });
  const nervousSystem = organism.nervousSystem || buildNervousSystem({ heartbeats: [], signals: [] });
  const phenotype = organism.phenotype || buildPhenotype({
    currentPlan: organism.phenotype?.currentPlan,
    activeExecution: organism.phenotype?.activeExecution,
    currentState: organism.phenotype?.currentState
  });
  const metabolism = organism.metabolism || { tokens: 0, cost: 0, latencyMs: 0, computeCycles: 0, sampledAt: new Date().toISOString() };

  await db.run(
    `INSERT OR REPLACE INTO mission_organism_state (organism_id, genome_json, phenotype_json, tissues_json, metabolism_json, immune_system_json, nervous_system_json, memory_json, survival_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      organism.id,
      JSON.stringify(organism.genome),
      JSON.stringify(phenotype),
      JSON.stringify(organism.tissues),
      JSON.stringify(metabolism),
      JSON.stringify(immuneSystem),
      JSON.stringify(nervousSystem),
      JSON.stringify(memory),
      JSON.stringify(survival)
    ]
  );
}

async function restoreOrganismState(db, organismId) {
  const row = await db.get(
    `SELECT genome_json, phenotype_json, tissues_json, metabolism_json, immune_system_json, nervous_system_json, memory_json, survival_json FROM mission_organism_state WHERE organism_id = ?`,
    organismId
  );
  if (!row) return null;

  const memory = row.memory_json ? { ...row.memory_json, checkpoints: row.memory_json.checkpoints || [], scars: row.memory_json.scars || [], failedStrategies: row.memory_json.failedStrategies || [] } : { checkpoints: [], scars: [], failedStrategies: [] };
  const survival = row.survival_json || { regeneration: null, quiescence: null, cryptobiosis: null, apoptosis: null };

  return {
    genome: row.genome_json ? JSON.parse(row.genome_json) : {},
    phenotype: row.phenotype_json ? JSON.parse(row.phenotype_json) : {},
    tissues: row.tissues_json ? JSON.parse(row.tissues_json) : [],
    metabolism: row.metabolism_json ? JSON.parse(row.metabolism_json) : { tokens: 0, cost: 0, latencyMs: 0, computeCycles: 0 },
    immuneSystem: row.immune_system_json ? JSON.parse(row.immune_system_json) : { evidenceGates: [], tests: [], anomalyDetection: null, quarantine: null },
    nervousSystem: row.nervous_system_json ? JSON.parse(row.nervous_system_json) : { heartbeats: [], signals: [] },
    memory,
    survival
  };
}

function buildMissionInput(missionId, task, extras = {}) {
  const { completionContract, invariants, safetyConstraints, context, ...rest } = extras;
  return {
    id: missionId,
    objective: task,
    completionContract,
    invariants,
    safetyConstraints,
    context,
    ...rest
  };
}

async function attachContract(organism, mission) {
  return attachHomeostasisToOrganism(organism, mission);
}

async function observeMissionPulses(db, missionId) {
  const agents = await fetchMissionAgents(db, missionId);
  const failed = agents.filter((a) => ['error', 'failed', 'terminated'].includes(a.status)).length;
  const pulses = [];
  for (const agent of agents) {
    const cellState = AGENT_STATUS_TO_CELL[agent.status] || 'alive';
    // Real emission: each pulse goes through emitCellPulse so the nervous
    // system is observable in telemetry, with a derived stress level instead
    // of a constant zero.
    const pulse = vitalSignals.emitCellPulse({
      cell: agent.id,
      mission: missionId,
      state: cellState === 'dead' ? 'dead' : (cellState === 'quiescent' ? 'quiescent' : 'active'),
      stress: vitalSignals.stressLevel({ recentFailures: failed })
    });
    pulses.push(pulse);
  }
  return pulses;
}

function deriveHomeostasisContext(input = {}) {
  const agents = input.agents || [];
  const failed = agents.filter((a) => ['error', 'failed', 'terminated'].includes(a.status)).length;
  const completed = agents.filter((a) => ['completed', 'unverified'].includes(a.status)).length;
  const running = agents.filter((a) => a.status === 'running').length;
  return {
    missionOutcome: input.missionOutcome === true,
    flags: {
      missionOutcome: input.missionOutcome === true,
      testsPassed: input.testsPassed === true,
      ...(input.flags || {})
    },
    evidence: input.evidence || [],
    functionalChecks: input.functionalChecks || {},
    structuralChecks: {
      testsPassed: input.testsPassed === true,
      forbiddenFilesChanged: input.forbiddenFilesChanged || [],
      ...(input.structuralChecks || {})
    },
    recentFailures: failed,
    missionsCompleted: completed,
    runningAgents: running
  };
}

async function evaluateContinuity(db, mission) {
  const organism = await assembleOrganism(db, mission);
  const organismWithContract = await attachContract(organism, mission);
  const agents = await fetchMissionAgents(db, mission.id);
  const context = deriveHomeostasisContext({ agents, ...mission.context });
  // Immune wiring: dead or injured cells are an injury. The immune gate
  // evaluates anomaly + functional coverage, and repeated failures enroll an
  // immune memory entry so the exact retry of a failed strategy is refused.
  const deadCells = agents
    .filter((a) => (AGENT_STATUS_TO_CELL[a.status] || 'alive') === 'dead')
    .map((a) => ({ identifier: a.id, kind: tissueKindForAgent(a), role: a.role, reason: a.status }));
  const safety = deadCells.length > 0
    ? immuneGate.isSafeToProceed({ organism: organismWithContract, context: { recentFailures: deadCells.length } })
    : { safe: true, anomaly: { anomalyLevel: 'none' }, functionCovered: true };
  let enrolledOrganism = organismWithContract;
  if (deadCells.length > 0 && safety.anomaly.repeatedFailures >= 2) {
    enrolledOrganism = deadCells.reduce(
      (org, cell) => immuneMemory.enrollImmuneMemory(org, {
        failureCategory: `cell_death:${cell.reason}`,
        strategy: cell.identifier,
        prohibitedExactRetry: true,
        preferredResponse: 'replace_worker'
      }),
      organismWithContract
    );
  }
  const evaluation = await evaluateMissionHomeostasis(db, {
    organism: enrolledOrganism,
    mission,
    context
  });
  return { organism: enrolledOrganism, immune: safety, ...evaluation };
}

async function transitionMissionToComplete(db, target) {
  const { transitionMissionToComplete: transition } = require('./homeostasisService');
  return transition(db, target);
}

function survivalModeFor(input = {}) {
  return survivalModes.survivalMode({
    missionIncomplete: input.missionIncomplete,
    budgetInsufficient: input.budgetInsufficient,
    missionViable: input.missionViable,
    noSafeAction: input.noSafeAction,
    waitingFor: input.waitingFor
  });
}

module.exports = {
  TISSUE_KINDS,
  AGENT_STATUS_TO_CELL,
  TERMINAL_STATUSES,
  tissueKindForAgent,
  agentToCell,
  fetchMissionAgents,
  assembleOrganism,
  buildMissionInput,
  attachContract,
  observeMissionPulses,
  deriveHomeostasisContext,
  evaluateContinuity,
  transitionMissionToComplete,
  survivalModeFor
};