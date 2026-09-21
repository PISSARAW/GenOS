'use strict';

/**
 * Mission Continuity Service — câble les six systèmes de continuité à une
 * mission réelle : assemble l'organisme depuis les agents en base, évalue
 * l'homéostasie, émet les pulses vitaux et décide des modes de survie.
 */

const { newOrganism, recordScar, recordCheckpoint, isFunctionCovered } = require('./missionOrganismService');
const { buildMissionHomeostasis, attachHomeostasisToOrganism, evaluateMissionHomeostasis } = require('./homeostasisService');
const vitalSignals = require('./vitalSignalsService');
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
  return newOrganism({
    id: `organism_${mission.id}`,
    genome: {
      objective: mission.objective || mission.task || null,
      invariants: mission.invariants || [],
      completionContract: mission.completionContract || null,
      safetyConstraints: mission.safetyConstraints || []
    },
    tissues: cells
  });
}

function buildMissionInput(missionId, task, extras = {}) {
  return { id: missionId, objective: task, ...extras };
}

async function attachContract(organism, mission) {
  return attachHomeostasisToOrganism(organism, mission);
}

async function observeMissionPulses(db, missionId) {
  const agents = await fetchMissionAgents(db, missionId);
  const pulses = [];
  for (const agent of agents) {
    const cellState = AGENT_STATUS_TO_CELL[agent.status] || 'alive';
    const pulse = vitalSignals.buildPulse({
      cell: agent.id,
      mission: missionId,
      state: cellState === 'dead' ? 'dead' : (cellState === 'quiescent' ? 'quiescent' : 'active'),
      stress: 0
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
  const evaluation = await evaluateMissionHomeostasis(db, {
    organism: organismWithContract,
    mission,
    context
  });
  return { organism: organismWithContract, ...evaluation };
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
  survivalModeFor
};