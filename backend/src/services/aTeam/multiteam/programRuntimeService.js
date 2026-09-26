'use strict';

const sessions = require('../../topologySessionStore');
const { composeMultiteam } = require('./multiteamComposer');

async function createProgramRun(input = {}) {
  const composition = composeMultiteam(input);
  const state = {
    programId: input.programId,
    parentTeamRunId: input.parentTeamRunId || null,
    status: 'READY',
    graph: composition.graph,
    council: composition.council,
    objectives: composition.objectives,
    budget: composition.budget,
    teams: composition.teams.map((team) => ({ teamId: team.teamId, definition: team, budget: composition.budget.local[team.teamId] || null, status: 'PENDING', receipt: null })),
    contracts: composition.contracts
  };
  if (!state.programId) throw coded('A programId is required.', 'ATEAM_MTS_PROGRAM_ID_REQUIRED');
  await sessions.save(input.db, { id: state.programId, topology: 'a_team_program', state });
  return state;
}

async function advanceProgramRun(input = {}) {
  if (typeof input.executeTeam !== 'function') throw coded('A verified subteam executor is required.', 'ATEAM_MTS_EXECUTOR_REQUIRED');
  const record = await sessions.load(input.db, input.programId);
  if (!record || record.topology !== 'a_team_program') throw coded('Unknown A-Team program run.', 'ATEAM_MTS_PROGRAM_UNKNOWN');
  let current = record;
  for (const layer of current.state.graph.topologicalLayers) {
    for (const nodeId of layer) {
      await runReadyTeam({ ...input, record: current, nodeId });
      current = await sessions.load(input.db, input.programId);
    }
  }
  const latest = await sessions.load(input.db, input.programId);
  return summarize(latest.state);
}

async function runReadyTeam(input) {
  const { record, nodeId } = input;
  const teamId = nodeId.slice('team:'.length);
  const team = record.state.teams.find((entry) => entry.teamId === teamId);
  if (!team || team.status !== 'PENDING' || !dependenciesSucceeded(record.state, teamId)) return;
  const definition = team.definition;
  const contracts = record.state.contracts.filter((contract) => contract.toTeamId === teamId);
  const result = await input.executeTeam({
    teamId, definition, contracts,
    idempotencyKey: `${record.state.programId}:${teamId}`,
    parentTeamRunId: record.state.parentTeamRunId,
    budget: team.budget
  });
  await persistOutcome({ db: input.db, record, teamId, result, contracts });
}

function dependenciesSucceeded(state, teamId) {
  const dependencies = state.graph.edges.filter((edge) => edge.toNode === `team:${teamId}` && edge.blocking);
  return dependencies.every((edge) => state.teams.find((team) => team.teamId === edge.fromNode.slice('team:'.length))?.status === 'SUCCEEDED');
}

async function persistOutcome(input) {
  const budget = budgetAllows(input.record.state, input.teamId, input.result);
  const verified = input.result?.status === 'SUCCEEDED' && verifiedContracts(input.contracts, input.result) && budget.allowed;
  const status = !budget.allowed || input.result?.status === 'FAILED' ? 'FAILED' : verified ? 'SUCCEEDED' : 'WAITING';
  const state = structuredClone(input.record.state);
  const team = state.teams.find((entry) => entry.teamId === input.teamId);
  team.status = status;
  team.receipt = { ...safeReceipt(input.result, verified), budgetViolation: budget.allowed ? null : budget.reason };
  state.status = deriveStatus(state.teams);
  await sessions.save(input.db, { id: state.programId, topology: 'a_team_program', revision: input.record.revision, state });
}

function verifiedContracts(contracts, result) {
  const required = contracts.filter((contract) => contract.blocking !== false).map((contract) => contract.contractId);
  const verified = new Set(result?.verifiedContractIds || []);
  return required.every((id) => id && verified.has(id))
    && (!required.length || (Array.isArray(result?.evidenceRefs) && result.evidenceRefs.length > 0));
}

function safeReceipt(result, verified) {
  return {
    status: result?.status || 'UNKNOWN', verified,
    childRunId: result?.childRunId || null,
    evidenceRefs: Array.isArray(result?.evidenceRefs) ? result.evidenceRefs.filter((item) => typeof item === 'string') : [],
    usage: normalizeUsage(result?.usage)
  };
}

function budgetAllows(state, teamId, result) {
  if (!state.budget?.enforced) return { allowed: true, reason: null };
  const local = state.teams.find((team) => team.teamId === teamId)?.budget || {};
  const usage = normalizeUsage(result?.usage);
  for (const dimension of ['tokens', 'compute', 'time']) {
    if (Number.isFinite(local[dimension]) && usage[dimension] > local[dimension]) return { allowed: false, reason: `local_${dimension}_limit` };
    const previous = state.teams.reduce((sum, team) => sum + (Number(team.receipt?.usage?.[dimension]) || 0), 0);
    if (Number.isFinite(state.budget.global?.[dimension]) && previous + usage[dimension] > state.budget.global[dimension]) return { allowed: false, reason: `global_${dimension}_limit` };
  }
  return { allowed: true, reason: null };
}

function normalizeUsage(value) {
  return Object.fromEntries(['tokens', 'compute', 'time'].map((dimension) => [dimension, Math.max(0, Number(value?.[dimension]) || 0)]));
}

function deriveStatus(teams) {
  if (teams.some((team) => team.status === 'FAILED')) return 'FAILED';
  if (teams.every((team) => team.status === 'SUCCEEDED')) return 'SUCCEEDED';
  return 'RUNNING';
}

function summarize(state) {
  return { programId: state.programId, status: state.status, teams: state.teams.map(({ teamId, status, receipt }) => ({ teamId, status, receipt })) };
}

function coded(message, code) {
  return Object.assign(new Error(message), { code });
}

module.exports = { createProgramRun, advanceProgramRun };
